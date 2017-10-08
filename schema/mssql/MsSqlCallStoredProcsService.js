import {missingArgument, invalidArgument} from '../../validation'
import missingService from '../../services/missingService'
import oncePerServices from '../../services/oncePerServices'
import addServiceStateValidation from '../../services/addServiceStateValidation'
import prettyPrint from '../../utils/prettyPrint'
import addPrefixToErrorMessage from '../../utils/addPrefixToErrorMessage'
import tedious from 'tedious'
import {stringToTediousTypeMap} from '../../connectors/MsSqlConnector.types'

const TYPES = tedious.TYPES; // http://tediousjs.github.io/tedious/api-datatypes.html

const hasOwnProperty = Object.prototype.hasOwnProperty;
const schema = require('./MsSqlCallStoredProcsService.schema');

const debug = require('debug')('mssql');

export default oncePerServices(function (services) {

  /**
   * Базовый класс для сервисов, которые позволяют обращаться к хранимым процедурам, как к методам JScript объектов.
   *
   * У инстанса этого сервиса добавляются методы, на основе схемы переданной в конструктор.  Методы назваются так же, как
   * хранимые процедуры, к которым они обращаются.  Параметры процедур, как именнованные параметры методов.
   * Так же можно передавать специальные параметры _offset и _limit, чтоб выбрать какой диапозон данных нужно вернуть.
   *
   * Методы возвращают данные в том формате, в котором возвращает коннектор: {rows, hasNext, columns}
   */
  class MsSqlCallStoredProcsService {

    constructor(options) {
      schema.ctor_options(this, options);
      if (!(hasOwnProperty.call(services, options.connector))) missingService(options.connector);
      this._connector = services[options.connector];
    }

    _addMethods(schema = missingArgument('schema')) {
      if (!(Array.isArray(schema))) invalidArgument('schema', schema);
      processSchema.call(this, schema);
      addServiceStateValidation(this, function() { return this._service; });
    }
  }

  return MsSqlCallStoredProcsService;
})

function processSchema(schema) {
  let methodModel;
  try {
    for (methodModel of schema)
      addMethod.call(this, methodModel);
  } catch (error) {
    addPrefixToErrorMessage(`Method ${prettyPrint(methodModel)}`, error);
  }
}

function addMethod(model) {

  let paramsDef;
  const params = model.params;
  if (params) {
    paramsDef = Object.create(null);
    for (const paramName in params) {
      if (hasOwnProperty.call(params, paramName)) {
        const parameterModel = params[paramName];
        if (parameterModel.mssqlType) {
          if (!hasOwnProperty.call(stringToTediousTypeMap, parameterModel.mssqlType)) throw new Error(`Unknown MsSqlConnector type: ${prettyPrint(parameterModel.mssqlType)}`);
          paramsDef[paramName] = parameterModel.mssqlType;
        } else if (parameterModel.type) {
          if (!hasOwnProperty.call(stringToTediousTypeMap, parameterModel.type)) throw new Error(`Unknown MsSqlConnector type: ${prettyPrint(parameterModel.type)}`);
          paramsDef[paramName] = parameterModel.type;
        } else {
          throw new Error(`Missing 'type' or 'mssqlType' attribute`);
        }
      }
    }
  }

  const storedProcName = model.name;

  this[storedProcName] = /*async*/ function (args = {}) {

    const {_offset = 0, _limit = Number.MAX_SAFE_INTEGER, ...params} = args;

    return this._connector.exec({procedure: storedProcName, offset: _offset, limit: _limit, paramsDef, params});
  }
}
