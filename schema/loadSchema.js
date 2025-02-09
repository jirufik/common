import {missingArgument} from '../utils/arguments'

import fs from 'fs'
import path from 'path'

const hasOwnProperty = Object.prototype.hasOwnProperty;

let cache = Object.create(null);

/**
 * Загружает *.js файлы из указанной директории, без просмотра поддиректорий.  При этом данным возвращаемым через
 * export default (это описание метода), присваивается свойство name, соотвествующее имени файла.
 *
 * Загруженный результат кешируется для повторного использования.
 *
 * @param schemaPath - Путь директории, из которой нужно загрузить схему.
 * @returns {[object]} Массив структур, загруженных из найденных файлов.
 */
export function loadFiles(schemaPath = missingArgument('schemaPath')) {
  const dir = path.resolve(process.cwd(), schemaPath);
  if (hasOwnProperty.call(cache, dir)) return cache[dir];
  let files = fs.readdirSync(dir); // тут нет смысла использовать асинхроинный readdir, так как файлы всё равно грузятся синхронным методом require()
  let res = [];
  for (let filename of files) {
    // оставляем только файлы, которые не начинаются с подчерка и имеют расширение js
    if (filename.startsWith('_') || !filename.endsWith('.js')) continue;
    // схема может содержать уточнение к graphQL, через определения класса наследника CyberlinesSchemaToGQL и export'а его через gqlExtClass
    let file;
    let {'default': method} = file = require(path.join(dir, filename));
    // проверяем что имя метода в файле или отсутствует или равно имени файла
    let methodName = path.basename(filename, '.js');
    if (method.hasOwnProperty('name') && method.name !== methodName)
      console.error(`File '${path.join(path.relative(process.cwd(), dir), filename)}': method.name '${method.name}' not equal to filename '${methodName}'`);
    method.name = methodName;
    res.push(file);
  }
  // кэшируем результат, так как одни и те же файлы используются для двух разных целей
  cache[dir] = res;
  return res;
}

/**
 * Возвращает массив описаний методов сервиса.  При этом из данных возвращаемых loadFiles скрывается допольнительные
 * свойства.  Остаются только описания методов внешнего сервиса (Например: Киберлайнз).
 *
 * @param schemaPath - Путь директории, из которой нужно загрузить схему.
 * @returns {[object]} Массив структур, загруженных из найденных файлов.
 */
export default function loadSchema({schemaPath = missingArgument('schemaPath')}) {
  let files = loadFiles(schemaPath);
  let res = [];
  for (let file of files) res.push(file.default);
  return res;
}

