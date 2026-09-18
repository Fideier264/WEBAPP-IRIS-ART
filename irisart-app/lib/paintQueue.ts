/** Serialize heavy native composite paints so Shop/Checkout don't freeze the JS thread. */
type Job = () => Promise<void>;

const high: Job[] = [];
const normal: Job[] = [];
let active = 0;
/** One at a time — print render + grid thumbs must not run in parallel on JS. */
const MAX_CONCURRENT = 1;

function pump() {
  while (active < MAX_CONCURRENT && (high.length > 0 || normal.length > 0)) {
    const job = high.shift() ?? normal.shift()!;
    active += 1;
    void job().finally(() => {
      active -= 1;
      pump();
    });
  }
}

export function enqueuePaint<T>(fn: () => Promise<T>, priority: 'high' | 'normal' = 'normal'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job = async () => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    };
    if (priority === 'high') high.push(job);
    else normal.push(job);
    pump();
  });
}

/** Let React paint the uploading spinner before a heavy sync job. */
export function yieldToUi(ms = 32): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
