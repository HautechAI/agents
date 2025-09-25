// Ensure mongodb-memory-server uses a CPU-compatible binary in CI/containers
// Use a Debian 12 compatible version that doesn't require AVX (7.0.x)
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.14';
process.env.MONGOMS_DOWNLOAD_DIR = process.env.MONGOMS_DOWNLOAD_DIR || '/tmp/mongodb-binaries';
