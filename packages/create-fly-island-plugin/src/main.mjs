// `npm create fly-island-plugin@latest [folder]`: asks for the language, the
// template, the id and the names, then writes a plugin folder (scaffold.mjs).
// Options skip the questions: --language, --template, --id, --name, --name-zh,
// --author, --yes (defaults for the rest).
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { LANGUAGES, TEMPLATES, idProblem, scaffold } from "./scaffold.mjs";

const LABELS = {
  powershell: "PowerShell (runs on every Windows, nothing to install)",
  typescript: "TypeScript (needs Node.js)",
  javascript: "JavaScript (needs Node.js)",
  command: "a command that shows a message on the island",
  list: "an island page with a list",
  status: "a status text on the collapsed island",
  blank: "nothing yet",
};

export function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "yes" || name === "help") options[name] = true;
    else options[name] = argv[(index += 1)];
  }
  return { dir: positional[0], ...options };
}

async function choose(ask, question, choices, fallback) {
  const lines = choices.map((choice, index) => `  ${index + 1}. ${LABELS[choice]}`).join("\n");
  const answer = (await ask(`${question}\n${lines}\nNumber [${choices.indexOf(fallback) + 1}]: `)).trim();
  return choices[Number(answer) - 1] ?? fallback;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: npm create fly-island-plugin@latest [folder] -- [--language ${LANGUAGES.join("|")}] [--template ${TEMPLATES.join("|")}] [--id <id>] [--name <English name>] [--name-zh <Chinese name>] [--author <name>] [--yes]`);
    return 0;
  }
  const input = { language: args.language, template: args.template, id: args.id, nameEn: args.name, nameZh: args["name-zh"], author: args.author };
  if (!args.yes && process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ask = (question) => rl.question(question);
    try {
      input.language ??= await choose(ask, "Language:", LANGUAGES, "powershell");
      input.template ??= await choose(ask, "Template:", TEMPLATES, "list");
      input.author ??= (await ask("Author (your GitHub name): ")).trim();
      input.nameEn ??= (await ask("Name in English [My plugin]: ")).trim();
      input.nameZh ??= (await ask("Name in Chinese [same as English]: ")).trim();
      while (!input.id) {
        const fallback = `${(input.author || "me").toLowerCase().replace(/[^a-z0-9-]+/g, "-")}.${(input.nameEn || "my-plugin").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        const id = (await ask(`Plugin id [${fallback}]: `)).trim() || fallback;
        const problem = idProblem(id);
        if (problem) console.log(`  ${problem}`);
        else input.id = id;
      }
    } finally {
      rl.close();
    }
  }
  input.dir = args.dir ?? input.id;
  const { options, written } = scaffold(input);
  const relative = path.relative(process.cwd(), options.dir) || ".";
  console.log(`\nCreated ${options.id} in ${relative}:`);
  for (const name of written) console.log(`  ${name}`);
  const next = [`cd ${relative}`];
  if (options.language !== "powershell") next.push("npm install");
  if (options.language === "typescript") next.push("npm run watch   (in a second terminal)");
  next.push("npx fly-island-plugin dev");
  console.log(`\nNext (README.md has the details):\n  ${next.join("\n  ")}`);
  return 0;
}
