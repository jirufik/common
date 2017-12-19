import pg from 'pg';
import {oncePerServices, fixDependsOn} from '../services'
import addServiceStateValidation from '../services/addServiceStateValidation'
import pgTestTime from '../utils/pgTestTime'

const SERVICE_TYPE = require('./PGConnector.serviceType').SERVICE_TYPE;
const schema = require('./PGConnector.schema');

export default oncePerServices(function (services) {

  const {bus = throwIfMissing('bus'), testMode} = services;

  class PGConnector {

    constructor(options) {
      schema.ctor_settings(this, options);
      const {debugWithFakeTimer, ...rest} = options;
      this._testTimer = pgTestTime(testMode && testMode.postgres);
      this._options = rest;
    }

    async _serviceStart() {
      const settingsWithoutPassword = {...this._options};
      delete settingsWithoutPassword.password;
      fixDependsOn(settingsWithoutPassword);
      bus.info({
        type: 'service.settings',
        source: this._service.get('name'),
        serviceType: SERVICE_TYPE,
        settings: settingsWithoutPassword,
      });
      this._pool = new pg.Pool(this._options);
      this._pool.on('error', (error, client) => {
        this._service.criticalFailure(error);
      });
      return this._exec({statement: `select now()::timestamp;`});
    }

    async _serviceStop() {
      return this._pool.end();
    }

    async connection() { // TODO: Добавить прерывание запроса, при помощий cancel: Proise, как в MsSqlConnector
      return this._innerConnection();
    }

    async _innerConnection() { // TODO: Добавить прерывание запроса, при помощий cancel: Proise, как в MsSqlConnector
      const self = this;
      return new Promise((resolve, reject) => {
        this._pool.connect(function (err, client, done) {
          if (err) reject(err);
          else resolve(new Connection(self, client, done));
        });
      })
    }

    async exec(args) {
      schema.exec_args(args);
      const connection = await this._innerConnection();
      try {
        return connection._innerExec(args);
      } finally {
        connection._end();
      }
    }
  }

  addServiceStateValidation(PGConnector.prototype, function () { return this._service; });

  class Connection {

    constructor(connector, client, done) {
      this._connector = connector;
      this._testTimer = connector._testTimer;
      this._client = client;
      this._done = done;
    }

    async exec(args) {
      schema.exec_args(args);
      return this._innerExec(args);
    }

    async _innerExec(args) {
      args = this._testTimer(args);
      // TODO: pg 7+ supports Promise as result itself - remove extra wrappers
      return new Promise((resolve, reject) => {
        this._client.query(args.statement, args.params, function (err, results) {
          if (err) reject(err);
          else resolve(results);
        });
      });
    }

    async end() {
      this._done();
      this._done = null;
    }
  }

  addServiceStateValidation(Connection.prototype, function () { return this._connector._service; });

  PGConnector.SERVICE_TYPE = SERVICE_TYPE;

  return PGConnector;
});
