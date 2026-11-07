// The page side of the system monitor. The page cannot read the system itself: main.ps1
// sends a { type: "sample" } every second while the page is open, and this script keeps
// a minute of history for the charts. getState / setState keep that minute while the
// island runs, so the charts are not empty when the page opens again.
const focusd = acquireFocusdApi();
const chinese = focusd.locale === "zh-CN";
const HISTORY = 60;
const text = chinese
  ? { memory: "内存", processes: "程序", byMemory: "内存", reading: "正在读取…", vram: "显存", down: "下载", up: "上传", battery: "电池", charging: "充电中", count: (n) => `${n} 个进程` }
  : { memory: "Memory", processes: "Programs", byMemory: "Memory", reading: "Reading…", vram: "VRAM", down: "Download", up: "Upload", battery: "Battery", charging: "charging", count: (n) => (n === 1 ? "1 process" : `${n} processes`) };

const $ = (id) => document.getElementById(id);
$("memory-label").textContent = text.memory;
$("processes-label").textContent = text.processes;
$("sort-memory").textContent = text.byMemory;
$("down-label").setAttribute("aria-label", text.down);
$("up-label").setAttribute("aria-label", text.up);
$("waiting").textContent = text.reading;

const saved = focusd.getState() || {};
const history = { cpu: [], gpu: [], down: [], up: [], ...(saved.history || {}) };
let sortBy = saved.sortBy === "memory" ? "memory" : "cpu";
let processes = saved.processes || null;
let last = null;

function push(values, value) {
  values.push(value);
  if (values.length > HISTORY) values.splice(0, values.length - HISTORY);
}

function bytes(value) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}

const percent = (value) => `${Math.round(Math.min(100, Math.max(0, value)))}%`;
const gigabytes = (used, total) => `${(used / 1024 ** 3).toFixed(1)} / ${Number((total / 1024 ** 3).toFixed(1))} GB`;

/** A minute of samples, right-aligned so the newest sits at the right edge. */
function spark(svg, values, max) {
  const [, , width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
  if (values.length === 0) {
    svg.replaceChildren();
    return;
  }
  const step = width / (HISTORY - 1);
  const start = width - step * (values.length - 1);
  const points = values.map((value, index) => `${(start + index * step).toFixed(1)},${(height - (Math.min(value, max) / max) * height).toFixed(1)}`);
  const ns = "http://www.w3.org/2000/svg";
  const fill = document.createElementNS(ns, "polygon");
  fill.setAttribute("class", "spark__fill");
  fill.setAttribute("points", `${points.join(" ")} ${width},${height} ${start.toFixed(1)},${height}`);
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("class", "spark__line");
  line.setAttribute("points", points.join(" "));
  svg.replaceChildren(fill, line);
}

function level(value, warm, hot) {
  return value >= hot ? "hot" : value >= warm ? "warm" : "normal";
}

function showCores(cores) {
  const box = $("cores");
  while (box.children.length < cores.length) {
    const core = document.createElement("span");
    core.className = "cores__core";
    core.append(document.createElement("span"));
    box.append(core);
  }
  while (box.children.length > cores.length) box.lastElementChild.remove();
  cores.forEach((value, index) => {
    box.children[index].firstElementChild.style.height = `${Math.max(4, Math.min(100, value))}%`;
  });
}

function showProcesses() {
  const list = $("processes");
  const rows = processes ? (sortBy === "cpu" ? processes.byCpu : processes.byMemory) : [];
  list.replaceChildren(
    ...rows.map((program) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      name.className = "processes__name";
      name.textContent = program.name;
      item.append(name);
      if (program.count > 1) {
        const count = document.createElement("span");
        count.className = "processes__count";
        count.textContent = `×${program.count}`;
        count.setAttribute("aria-label", text.count(program.count));
        item.append(count);
      }
      const cpu = document.createElement("span");
      cpu.className = `processes__cpu${sortBy === "cpu" ? " processes__sorted" : ""}`;
      cpu.textContent = `${Number(program.cpu).toFixed(1)}%`;
      const memory = document.createElement("span");
      memory.className = `processes__memory${sortBy === "memory" ? " processes__sorted" : ""}`;
      memory.textContent = bytes(program.memory);
      item.append(cpu, memory);
      return item;
    }),
  );
  for (const button of $("sort").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.sort === sortBy));
}

function show(sample) {
  $("monitor").hidden = false;
  $("waiting").hidden = true;
  $("cpu").textContent = percent(sample.cpu);
  $("cpu-temperature").textContent = sample.cpuTemperature == null ? "" : `${Math.round(sample.cpuTemperature)}°C`;
  spark($("cpu-spark"), history.cpu, 100);
  showCores(sample.cores || []);

  const gpu = sample.gpu;
  $("gpu").textContent = gpu && gpu.usage != null ? percent(gpu.usage) : "—";
  $("gpu-temperature").textContent = gpu && gpu.temperature != null ? `${Math.round(gpu.temperature)}°C` : "";
  spark($("gpu-spark"), history.gpu, 100);
  const foot = [];
  foot.push(gpu ? gpu.name.replace(/^NVIDIA (GeForce )?/, "") : "—");
  if (gpu && gpu.memoryUsed != null && gpu.memoryTotal != null) foot.push(`${text.vram} ${gigabytes(gpu.memoryUsed * 1024 ** 2, gpu.memoryTotal * 1024 ** 2)}`);
  if (gpu && gpu.power != null) foot.push(`${Math.round(gpu.power)} W`);
  $("gpu-foot").replaceChildren(...foot.map((part) => Object.assign(document.createElement("span"), { textContent: part })));

  const memoryShare = sample.memoryTotal > 0 ? (sample.memoryUsed / sample.memoryTotal) * 100 : 0;
  const meter = $("memory-meter");
  meter.className = `meter meter--${level(memoryShare, 70, 90)}`;
  meter.firstElementChild.style.width = `${Math.min(100, memoryShare)}%`;
  $("memory").textContent = gigabytes(sample.memoryUsed, sample.memoryTotal);

  // Download and upload share one scale so they compare at a glance.
  const rateMax = Math.max(64 * 1024, ...history.down, ...history.up);
  $("download").textContent = `${bytes(sample.download)}/s`;
  $("upload").textContent = `${bytes(sample.upload)}/s`;
  spark($("down-spark"), history.down, rateMax);
  spark($("up-spark"), history.up, rateMax);

  const battery = $("battery");
  battery.hidden = !sample.battery;
  if (sample.battery) {
    battery.textContent = `${sample.battery.charging ? "⚡" : ""}${sample.battery.percent}%`;
    battery.setAttribute("aria-label", `${text.battery} ${sample.battery.percent}%${sample.battery.charging ? `, ${text.charging}` : ""}`);
  }
  showProcesses();
}

$("sort").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-sort]");
  if (!button) return;
  sortBy = button.dataset.sort;
  showProcesses();
  focusd.setState({ history, sortBy, processes, last });
});

focusd.onMessage((message) => {
  if (!message || message.type !== "sample") return;
  push(history.cpu, message.cpu);
  push(history.gpu, message.gpu && message.gpu.usage != null ? message.gpu.usage : 0);
  push(history.down, message.download);
  push(history.up, message.upload);
  if (message.processes) processes = message.processes;
  last = message;
  show(message);
  focusd.setState({ history, sortBy, processes, last });
});

if (saved.last) {
  last = saved.last;
  show(saved.last);
}
focusd.postMessage({ type: "ready" });
