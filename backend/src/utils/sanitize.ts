// utils/sanitize.ts
import { filterXSS } from 'xss';

export function sanitizeInput(input: string): string {
  return filterXSS(input, {
    whiteList: {}, // пустой объект - удаляет все теги
    stripIgnoreTag: true, // удаляет неразрешенные теги
    stripIgnoreTagBody: ['script'] // особо удаляет script-теги
  });
}