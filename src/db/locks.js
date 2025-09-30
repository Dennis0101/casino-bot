export async function withTableLock(prisma, tableId, fn) {
  const [{ k }] = await prisma.$queryRawUnsafe(
    "select ('x'||substr(md5($1),1,16))::bit(64)::bigint as k", tableId
  );
  const got = await prisma.$queryRawUnsafe('select pg_try_advisory_lock($1) as ok', k);
  if (!got[0].ok) throw new Error('Table busy');
  try { return await fn(); }
  finally { await prisma.$queryRawUnsafe('select pg_advisory_unlock($1)', k); }
}
