#!/usr/bin/env node
import { main } from "../src/main.mjs";

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(`error: ${error?.message ?? error}`);
    process.exitCode = 1;
  },
);
