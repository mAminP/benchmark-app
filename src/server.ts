import express from "express";
import path from "path";
import { performance } from "perf_hooks";
import fs from "fs";
import v8 from "v8";

// --- تنظیمات اصلی ---
const app = express();
const port = 3000;
const dataSize = 15_000_000; // بهینه‌تر از ۱۵ میلیون برای تست heap

// --- کمک‌یاب‌ها ---
function createHeavyObject(index: number) {
  return {
    id: index,
    name: "x".repeat(500),
    description: "y".repeat(500),
    timestamp: new Date().toISOString(),
  };
}

function* generateHeavyObjects(count: number): Generator<object> {
  for (let i = 0; i < count; i++) {
    yield createHeavyObject(i);
  }
}

const getMemoryMB = () => process.memoryUsage().heapUsed / 1024 / 1024;

function getPeakAndAvg(samples: number[]) {
  if (samples.length === 0) return { peak: 0, avg: 0 };
  const peak = Math.max(...samples);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { peak, avg };
}

function logHeapLimit() {
  const heapStatistics = v8.getHeapStatistics();
  console.log(
    "Heap Size Limit:",
    (heapStatistics.heap_size_limit / 1024 / 1024).toFixed(2),
    "MB"
  );
}

// --- تست‌ها ---

async function runDumpTest() {
  console.log("🧪 Starting runDumpTest");
  const memorySamples: number[] = [];
  const start = performance.now();
  const data: object[] = [];

  let i = 0;
  for (const item of generateHeavyObjects(dataSize)) {
    data.push(item);
    i++;
    if (i % 100_000 === 0) {
      const mem = getMemoryMB();
      memorySamples.push(mem);
      console.log(`Stored ${i} objects | Memory: ${mem.toFixed(2)} MB`);
    }
  }

  const end = performance.now();
  memorySamples.push(getMemoryMB());
  const { peak, avg } = getPeakAndAvg(memorySamples);
  console.log("✅ Finished runDumpTest");

  return {
    timeMs: end - start,
    peakMemoryMB: peak,
    avgMemoryMB: avg,
  };
}

async function runStreamTest() {
  console.log("🧪 Starting runStreamTest");
  const memorySamples: number[] = [];
  const start = performance.now();

  let count = 0;
  for (const item of generateHeavyObjects(dataSize)) {
    // Simulate light processing
    const len = (item as any).name.length;
    void len;

    count++;
    if (count % 100_000 === 0) {
      const mem = getMemoryMB();
      memorySamples.push(mem);
      console.log(`Processed ${count} objects | Memory: ${mem.toFixed(2)} MB`);
    }
  }

  const end = performance.now();
  memorySamples.push(getMemoryMB());
  const { peak, avg } = getPeakAndAvg(memorySamples);
  console.log("✅ Finished runStreamTest");

  return {
    timeMs: end - start,
    peakMemoryMB: peak,
    avgMemoryMB: avg,
  };
}

// --- مسیرهای وب ---
app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (_req, res) => {
  const indexPath = path.join(__dirname, "../public/index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Main page not found");
  }
});

app.get("/benchmark", async (_req, res) => {
  console.log("🚀 Starting benchmark...");
  logHeapLimit();

  const stream = await runStreamTest();

  if (global.gc) {
    console.log("♻️ Running garbage collection...");
    global.gc();
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    console.warn("⚠️ GC is not exposed! Run with --expose-gc");
  }

  const dump = await runDumpTest();

  console.log("🎯 Finished benchmark.");
  res.json({ stream, dump });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
