declare class Nunjucks<T> {
  extensions: {[string]: T},
  addExtension: (name: string, ext: T) => void,
  addFilter: (name: string, ext: Function) => void,
  renderString: (text: string, context: Object, callback: Function) => void
}

declare type Config = {
  autoescape: boolean,
  throwOnUndefined: boolean,
  tags: {
    blockStart: string,
    blockEnd: string,
    variableStart: string,
    variableEnd: string,
    commentStart: string,
    commentEnd: string
  }
};

declare module 'nunjucks' {
  declare module.exports: {
    configure: <T>(config: Config) => Nunjucks<T>
  }
}
