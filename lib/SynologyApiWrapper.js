var request = require("request");
var wol = require("wake_on_lan");
var SynoAPI = require("syno");

var defaults = {
  config: {
    host: "diskstation.local",
    apiVersion: undefined,
    secure: false,
    ignoreCertificateErrors: false,
    cacheInterval: 10000
  },
  data: {
    model: "Diskstation (unknown)",
    serial: "(unknown)",
    version: "(unknown)",
    temperature: -99,
    active: false
  }
};

var SynologyApiWrapper = function(params) {
    if (params.secure != false && params.secure != true) params.secure = defaults.config.secure;

    this.synoAPI = new SynoAPI({
      ignoreCertificateErrors: true,
      // Requests protocol : "http" or "https" (default: http)
      protocol: "http" + (params.secure ? "s" : ""),
      // DSM host : ip, domain name (default: localhost)
      host: params.host || defaults.config.host,
      // DSM port : port number (default: 5000)
      port: params.port || (params.secure ? 5001 : 5000),
      // DSM User account (required)
      account: params.account,
      // DSM User password (required)
      passwd: params.password,
      // DSM API version (optional)
      apiVersion: params.apiVersion || defaults.config.apiVersion
    });

    this.cacheInterval = params.cacheInterval || defaults.config.cacheInterval;
    this.mac = params.mac || null;

    this.refreshRunning = false;
    this.lastReferesh = -1;

    this.data = {};
    this.data.model = defaults.data.model;
    this.data.serial = defaults.data.serial;
    this.data.version = defaults.data.version;
    this.data.temperature = defaults.data.temperature;
    this.data.active = defaults.data.active;
};

SynologyApiWrapper.prototype.isRefreshNeeded = function() {
  return new Date().getTime() - this.lastReferesh >= this.cacheInterval;
}

SynologyApiWrapper.prototype.refreshDiskStationInfo = function(callback) {
  this.refreshRunning = true;
  this.synoAPI.dsm.getInfo(function(err, response) {
    this.refreshRunning = false;
      if (!err && response) {
        this.lastReferesh = new Date().getTime();
        this.data.model = response.model;
        this.data.serial = response.serial;
        this.data.version = response.version_string;
        this.data.temperature = response.temperature;
        this.data.active = response.uptime > 0;
        callback(null, this.data);
      } else {
        var errorStr = "" + err;
        if (errorStr.indexOf("ECONNREFUSED") >= 0 || errorStr.indexOf("ETIMEDOUT") >= 0 || errorStr.indexOf("EHOSTUNREACH") >= 0 || errorStr.indexOf("Unknown error") >= 0) {
          this.data.temperature = defaults.data.temperature;
          this.data.active = false;
          callback(null, this.data);
        } else {
          console.error("Something went wrong fetching disk station info: " + err);
          callback(null, defaults.data);
        }
      }
  }.bind(this));
};

SynologyApiWrapper.prototype.shutdown = function(callback) {
  this.legacyLogin(function(err, auth) {
      if (!err) {
          var params = {
              api: 'SYNO.Core.System',
              version: 1,
              method: 'shutdown',
              _sid: auth.sid
          };

          request({
              url: this.synoAPI.protocol + '://' + this.synoAPI.host + ':' + this.synoAPI.port + '/webapi/entry.cgi',
              qs: params,
              method: 'GET'
          }, function(err, res, body) {
            if (!err) {
              callback(null);
            } else {
              console.log(err);
              callback(null);
            }
          }.bind(this));
      } else {
          callback(err);
      }
  }.bind(this));
};

SynologyApiWrapper.prototype.wakeUp = function(callback) {
  if (!this.mac) {
    callback(null);
    return;
  }

  console.log("waking up: " + this.mac);
  var mac = "" + this.mac; // create a clone as wol.wake does manipulate the reference and therefore could otherwise only be used once

  wol.wake(mac, function(err) {
    if (!err) {
      callback(null)
    } else {
      console.log("wake error: " + err);
      callback(null);
    }
  }.bind(this));
};

SynologyApiWrapper.prototype.getInfo = function(callback) {
  if (this.isRefreshNeeded()) {
    if (this.data && this.data.model && this.data.serial && this.data.version) {
      this.refreshDiskStationInfo(function(err, data) {});
      callback(null, {
        model: this.data.model,
        serial: this.data.serial,
        version: this.data.version
      });
    } else {
      this.refreshDiskStationInfo(function(err, data) {
        callback(null, {
          model: this.data.model,
          serial: this.data.serial,
          version: this.data.version
        });
      }.bind(this));
    }
  } else {
    callback(null, {
      model: this.data.model,
      serial: this.data.serial,
      version: this.data.version
    });
  }
};

SynologyApiWrapper.prototype.isActive = function(callback) {
  if (this.isRefreshNeeded()) {
    if (this.data && (this.data.active == true || this.data.active == false)) {
      this.refreshDiskStationInfo(function() { }.bind(this));
      callback(null, this.data.active);
    } else {
      this.refreshDiskStationInfo(function() {
        callback(null, this.data.active);
      }.bind(this));
    }
  } else {
    callback(null, this.data.active);
  }
};

SynologyApiWrapper.prototype.getTemperature = function(callback) {
  if (this.isRefreshNeeded()) {
    this.refreshDiskStationInfo(function() {
      callback(null, this.data.temperature);
    }.bind(this));
  } else {
    callback(null, this.data.temperature);
  }
};

SynologyApiWrapper.prototype.legacyLogin = function(callback) {
  var params = {
      api: 'SYNO.API.Auth',
      method: 'login',
      version: 3,
      account: this.synoAPI.account,
      passwd: this.synoAPI.passwd,
      session: 'homebridge-synology-' + Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10),
      format: 'sid'
  };

  request({
      url: this.synoAPI.protocol + '://' + this.synoAPI.host + ':' + this.synoAPI.port + '/webapi/auth.cgi',
      qs: params,
      timeout: this.timeout
  }, function(err, res, body) {
      if (!err) {
          var json = JSON.parse(res.body || body);
          if (json.success) {
              callback(null, {sid: json.data.sid, time: new Date / 1e3 | 0});
          } else {
              callback(err);
          }
      } else {
          callback(err);
      }
  }.bind(this));
}

module.exports = SynologyApiWrapper;
