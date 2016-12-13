import { Injectable, OpaqueToken } from '@angular/core';
import { Plugin } from './plugin';

export const HttpPluginsToken = new OpaqueToken('HTTP_PLUGINS');

const EventsMethods = [ 'preRequest', 'postRequest', 'postRequestSuccess', 'postRequestError' ];

@Injectable()
export class Plugins {

  private plugins: Array<{[name: string]: Plugin}> = [];

  private throwsException: boolean = false;

  constructor(plugins?: Array<Plugin>) {
    if (plugins) {
      this.set(plugins);
    }
  }

  set(plugins: Array<Plugin>): this {
    this.plugins = [];
    for (let plugin of plugins) {
      this.add(plugin);
    }

    return this;
  }

  setThrowsException(throws: boolean): this {
    this.throwsException = throws;
    return this;
  }

  add(plugin: Plugin, priority?: number): this {
    // workaround typescript not exists verification of interfaces
    let implementsInterfaces = false;
    for (let method of EventsMethods) {
      if (method in plugin) {
        implementsInterfaces = true;
      }
    }

    if (implementsInterfaces === false) {
      throw 'Plugin not implements interface of events (preRequest, postRequest ...).';
    }

    let pluginConf: any = {};

    pluginConf[plugin.getName()] = plugin;

    if (!priority) {
      priority = plugin.getPriority();
    }

    // if key exists add before pluginConfig
    if (this.plugins[priority]) {
      this.plugins.splice(priority, 0, pluginConf);
    } else {
      this.plugins[priority] = pluginConf;
    }

    this.plugins.filter((value) => value !== undefined || value !== null);

    return this;
  }

  get(name: string): Plugin | null {
    let index: number = this.indexOf(name);

    if (index !== -1) {
      return this.plugins[index][name];
    }

    return null;
  }

  has(name: string): boolean {
    return this.indexOf(name) !== -1 ? true : false;
  }

  indexOf(name: string): number {

    for (let index = 0, length = this.plugins.length; index < length; index++) {
      let plugin = this.plugins[index];
      if (plugin[name]) {
        return index;
      }
    }

    return -1;
  }

  remove(name: string): boolean {
    let index = this.indexOf(name);
    if (index !== -1) {
      this.plugins.splice(index, 1);
      return true;
    }

    return false;
  }

  getAll(): Array<{[name: string]: Plugin}> {
    return this.plugins;
  }

  forEach(fn: (plugin: Plugin, index?: number) => boolean | void) {
    let i = 0;
    for (let object of this.plugins) {
      for (let name in object) {

        let fnBreak: any = fn(object[name], i++);

        if (fnBreak === false) {
          return;
        }
      }
    }
  }

  runEvent(event: string, params: Array<any>) {
    if (EventsMethods.indexOf(event) === -1) {
      throw new Error(`Event '${event}' not exists`);
    }

    this.forEach((plugin: Plugin) => {
      if (!(event in plugin)) {
        return;
      }

      try {
        let method  = plugin[event];
        method.apply(plugin, params);
      } catch (ex) {
        if (this.throwsException) {
          throw ex;
        }
      }
    });
  }
}
