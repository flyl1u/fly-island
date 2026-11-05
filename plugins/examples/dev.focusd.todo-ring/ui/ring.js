// The page side of the todo ring. acquireFocusdApi() is the page's only link
// to the island: messages go to this plugin's process (main.ps1), and
// getState / setState keep the last counts while the island runs, so the ring
// shows them at once when the page opens again.
const focusd = acquireFocusdApi();
const chinese = focusd.locale === "zh-CN";
const value = document.querySelector(".ring__value");
const percent = document.getElementById("percent");
const counts = document.getElementById("counts");
const refresh = document.getElementById("refresh");

refresh.textContent = chinese ? "刷新" : "Refresh";
refresh.addEventListener("click", () => focusd.postMessage({ type: "refresh" }));

function show({ done, total }) {
  const share = total === 0 ? 0 : Math.round((done / total) * 100);
  value.style.strokeDasharray = `${share} 100`;
  percent.textContent = total === 0 ? "–" : `${share}%`;
  counts.textContent = total === 0 ? (chinese ? "今天还没有待办" : "No todos today") : chinese ? `完成 ${done} / ${total}` : `${done} of ${total} done`;
}

const saved = focusd.getState();
if (saved) show(saved);

focusd.onMessage((message) => {
  if (message && message.type === "counts") {
    show(message);
    focusd.setState({ done: message.done, total: message.total });
  }
});

focusd.postMessage({ type: "ready" });
