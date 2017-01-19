var Service, Characteristic;
var SynologyAPI = require('./lib/SynologyApiWrapper');
// var config = require('./config.json');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-synology-diskstation', 'SynologyDiskstation', SynologyDiskstationAccessory);
};

function SynologyDiskstationAccessory(log, config) {
    this.log = log;
    this.synologyAPI = new SynologyAPI(config);
    this.synologyAPI.refreshDiskStationInfo(this.updateInformationService.bind(this));

    return this;
}

SynologyDiskstationAccessory.prototype.updateInformationService = function(err, data) {
  if (!err && data) {
    this.name = data.name;
    this.serial = data.serial;
    this.version = data.version;

    if (this.informationService) {
      this.informationService.setCharacteristic(Characteristic.Name, this.name)
      this.informationService.setCharacteristic(Characteristic.Manufacturer, 'Synology');
      this.informationService.setCharacteristic(Characteristic.Version, this.version);
      this.informationService.setCharacteristic(Characteristic.SerialNumber, this.serial);
    }
  } else {
    this.log("Something went wrong fetching disk station info: " + err);
  }
}

SynologyDiskstationAccessory.StatsService = function (displayName, subtype) {
    Service.call(this, displayName, '9d0ea4eb-31db-47e9-83ef-302193e669d8', subtype);
    this.addCharacteristic(Characteristic.StatusActive);
};

SynologyDiskstationAccessory.prototype.setPowerState = function (powerState, callback) {
    if (powerState) { //turn on
        this.synologyAPI.wakeUp(function (err) {
            if (!err) {
                this.log('Diskstation woked up!');
                callback(null);
            } else {
                this.log('Something went wrong 12: ' + err);
                callback(err);
            }
        }.bind(this));
    } else { //turn off
        this.synologyAPI.shutdown(function (err) {
            (err) ? callback(err) : callback(null);
        }.bind(this));
    }
};

SynologyDiskstationAccessory.prototype.getServices = function () {
    var services = [];

    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Name, this.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Synology')
      .setCharacteristic(Characteristic.SoftwareRevision, this.version)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    services.push(this.informationService);

    this.switchService = new Service.Switch(this.name);
    this.switchService.getCharacteristic(Characteristic.On)
      .on('get', function(callback) {
        this.synologyAPI.isActive(function(err, data) {
          if (!err && data) {
            this.synologyAPI.refreshDiskStationInfo(this.updateInformationService.bind(this));
          }

          callback(err, data);
        }.bind(this));
      }.bind(this))
      .on('set', this.setPowerState.bind(this));
    services.push(this.switchService);

    this.temperatureService = new Service.TemperatureSensor('System Temperature');
    this.temperatureService.getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.synologyAPI.getTemperature.bind(this.synologyAPI));
    this.temperatureService.getCharacteristic(Characteristic.StatusActive)
      .on('get', this.synologyAPI.isActive.bind(this.synologyAPI));
    services.push(this.temperatureService);

    return services;
};
