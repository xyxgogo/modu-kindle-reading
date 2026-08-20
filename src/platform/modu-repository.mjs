/**
 * ModuRepository 运行时契约。
 *
 * 实现必须提供：listLexemes、getLexeme、getProgress、listProgress、saveEvent。
 * 领域层只依赖这个契约，不得直接读取平台环境变量或具体数据库 driver。
 */
export function assertModuRepository(repository) {
  for (const method of ["listLexemes", "getLexeme", "getProgress", "listProgress", "saveEvent"]) {
    if (typeof repository?.[method] !== "function") {
      throw new TypeError(`ModuRepository is missing ${method}()`);
    }
  }
  return repository;
}
