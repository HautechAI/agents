import 'dockerode';

declare module 'dockerode' {
  interface ContainerCreateOptions {
    Platform?: string;
    Entrypoint?: string | string[];
  }

  interface ImagePullOptions {
    platform?: string;
  }
}
