type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

function emit(level: LogLevel, message: string) {
  const output = `[graph-converter] ${message}`;
  if (level === 'info' || level === 'debug') {
    console.log(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.error(output);
  }
}

export function createLogger(verbose: boolean): Logger {
  return {
    info(message) {
      emit('info', message);
    },
    warn(message) {
      emit('warn', message);
    },
    error(message) {
      emit('error', message);
    },
    debug(message) {
      if (verbose) emit('debug', message);
    },
  };
}
