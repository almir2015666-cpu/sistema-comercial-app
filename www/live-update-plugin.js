var capacitorLiveUpdate = (function (exports, core) {
    'use strict';

    const LiveUpdate = core.registerPlugin('LiveUpdate', {
        web: () => Promise.resolve().then(function () { return web; }).then(m => new m.LiveUpdateWeb()),
    });

    class LiveUpdateWeb extends core.WebPlugin {
        async clearBlockedBundles() {
            this.throwUnimplementedError();
        }
        async deleteBundle(_options) {
            this.throwUnimplementedError();
        }
        async downloadBundle(_options) {
            this.throwUnimplementedError();
        }
        async fetchChannels() {
            this.throwUnimplementedError();
        }
        async fetchLatestBundle() {
            this.throwUnimplementedError();
        }
        async getBlockedBundles() {
            this.throwUnimplementedError();
        }
        async getBundle() {
            this.throwUnimplementedError();
        }
        async getBundles() {
            this.throwUnimplementedError();
        }
        async getDownloadedBundles() {
            this.throwUnimplementedError();
        }
        async getChannel() {
            this.throwUnimplementedError();
        }
        async getConfig() {
            this.throwUnimplementedError();
        }
        async getCurrentBundle() {
            this.throwUnimplementedError();
        }
        async getCustomId() {
            this.throwUnimplementedError();
        }
        async getDeviceId() {
            this.throwUnimplementedError();
        }
        async getNextBundle() {
            this.throwUnimplementedError();
        }
        async getVersionCode() {
            this.throwUnimplementedError();
        }
        async getVersionName() {
            this.throwUnimplementedError();
        }
        async isSyncing() {
            this.throwUnimplementedError();
        }
        async ready() {
            this.throwUnimplementedError();
        }
        async reload() {
            this.throwUnimplementedError();
        }
        async reset() {
            this.throwUnimplementedError();
        }
        async resetConfig() {
            this.throwUnimplementedError();
        }
        async setBundle(_options) {
            this.throwUnimplementedError();
        }
        async setChannel(_options) {
            this.throwUnimplementedError();
        }
        async setConfig(_options) {
            this.throwUnimplementedError();
        }
        async setCustomId(_options) {
            this.throwUnimplementedError();
        }
        async setNextBundle(_options) {
            this.throwUnimplementedError();
        }
        async sync() {
            this.throwUnimplementedError();
        }
        throwUnimplementedError() {
            throw this.unimplemented('Not implemented on web.');
        }
    }

    var web = /*#__PURE__*/Object.freeze({
        __proto__: null,
        LiveUpdateWeb: LiveUpdateWeb
    });

    exports.LiveUpdate = LiveUpdate;

    return exports;

})({}, capacitorExports);
//# sourceMappingURL=plugin.js.map
