import ThreeDigitalTwin from "./threedigitaltwin.js";

function noop() {
}

class ElementProxyReceiver extends ThreeDigitalTwin.EventDispatcher {
    constructor() {
        super();
    }
    get clientWidth() {
        return this.width;
    }
    get clientHeight() {
        return this.height;
    }
    getBoundingClientRect() {
        return {
            left: this.left,
            top: this.top,
            width: this.width,
            height: this.height,
            right: this.left + this.width,
            bottom: this.top + this.height,
        };
    }
    handleEvent(data) {
        if (data.type === 'size') {
            this.left = data.left;
            this.top = data.top;
            this.width = data.width;
            this.height = data.height;
            return;
        }
        data.preventDefault = noop;
        data.stopPropagation = noop;
        this.dispatchEvent(data);
    }
    focus() {
        // no-op
    }
}

class ProxyManager {
    constructor() {
        this.targets = {};
        this.handleEvent = this.handleEvent.bind(this);
    }
    makeProxy(data) {
        const { id } = data;
        const proxy = new ElementProxyReceiver();
        this.targets[id] = proxy;
    }
    getProxy(id) {
        return this.targets[id];
    }
    handleEvent(data) {
        this.targets[data.id].handleEvent(data.data);
    }
}

const proxyManager = new ProxyManager();

function start(data) {

    const proxy = proxyManager.getProxy(data.canvasId);
    proxy.body = proxy;  // HACK!
    self.window = proxy;
    self.document = {
        addEventListener: proxy.addEventListener.bind(proxy),
        removeEventListener: proxy.removeEventListener.bind(proxy),
    };
    init({
        canvas: data.canvas,
        inputElement: proxy,
        options: data.options,
    });
}

function init(data) {
    const { canvas, inputElement, options } = data;

    self.digitalTwin = new ThreeDigitalTwin(inputElement, canvas, options);
}

self.onmessage = (e) => {
    switch (e.data.type) {
        case "makeProxy":
            proxyManager.makeProxy(e.data);
            break;
        case "start":
            start(e.data)
            break;
        case "event":
            proxyManager.handleEvent(e.data);
            break;
        case "loadDataset":
            self.digitalTwin.loadDataset(e.data);
            break;
        default:
            throw new Error('no handler for type: ' + e.data.type);
    }

    return;
    //self.postMessage({ text: text + text });
};