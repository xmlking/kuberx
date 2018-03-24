#!/usr/bin/env node

import {Client, query, k8s} from "../../src";
import * as chalk from "chalk";
import * as minimist from "minimist";

if (process.argv.length < 3) {
  console.log(`Usage: kgrep <log-regex> [pod-regex] [--streaming]`)
  process.exit(1);
}

const argv = minimist(process.argv.slice(2));
const stream = argv.stream != null;

const logRegex = RegExp(argv._[0], "g");
const podRegex =
  argv._.length == 1
  ? RegExp(".+", "g")
  : RegExp(argv._[1], "g");

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------

const filterAndColorize = (lines: string[]): string[][] => {
  const filtered = [];
  for (const line of lines) {
    let slices = [];
    let match = null;
    let lastIndex = 0;
    let foundMatch = false;
    while ((match = logRegex.exec(line)) !== null) {
      slices.push(line.slice(lastIndex, match.index));
      slices.push(
        chalk.default.red(
          line.slice(match.index, match.index + match[0].length)))
      lastIndex = match.index + match[0].length;
      foundMatch = true;
    }

    if (foundMatch) {
      slices.push(line.slice(lastIndex));
      filtered.push(slices.join(""));
    }
  }
  return filtered.length > 0 ? [filtered] : [];
}

// --------------------------------------------------------------------------
// Get logs, grep.
// --------------------------------------------------------------------------

const c = Client.fromFile(<string>process.env.KUBECONFIG);
c.core.v1.Pod
  .list("default")
  .flatMap(pod => {
    if (!podRegex.test(pod.metadata.name)) return [];

    const logs =
      stream
      ? c.core.v1.Pod.logStream(pod.metadata.name, pod.metadata.namespace)
      : c.core.v1.Pod.logs(pod.metadata.name, pod.metadata.namespace);

    return logs
      .filter(logs => logs != null)
      .map(logs => logs.split(/\r?\n/))
      .flatMap(filterAndColorize)
      .map(lines => {return {pod: pod, logsLines: lines}})
  })
  .forEach(({pod, logsLines}) => {
    logsLines.forEach(line => {
      console.log(`${pod.metadata.name}: ${line}`)
    });
  });
