/** Pruebas de integración: levantan la API completa contra una base PostgreSQL real. */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  // La primera suite compila toda la API con ts-jest: en equipos lentos tarda más de 30 s.
  testTimeout: 60000,
};
