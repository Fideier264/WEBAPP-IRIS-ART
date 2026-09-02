/** Serialize heavy native composite paints so Shop doesn't freeze with 6 concurrent jobs. */
type Job = () => Promise<void>;

const high: Job[] = [];
const normal: Job[] = [];
let active = 0;
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
