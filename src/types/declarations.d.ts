declare module '*.mp3' {
  const value: number;
  export default value;
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
