export async function register(): Promise<void> {
  const { assertProductionClientIp } = await import("./server/forwarded-for");
  assertProductionClientIp(process.env);
}
