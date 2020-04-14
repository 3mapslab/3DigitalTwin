import Worker from "worker-loader!./digitaltwin.worker.js";

class DigitalTwinProxy {

    constructor(workerUrl) {

        this.workerUrl = workerUrl;

        this.mouseEventHandler = this.makeSendPropertiesHandler([
            "ctrlKey",
            "metaKey",
            "shiftKey",
            "button",
            "clientX",
            "clientY",
            "pageX",
            "pageY"
        ]);

        this.wheelEventHandlerImpl = this.makeSendPropertiesHandler([
            "deltaX",
            "deltaY"
        ]);

        this.keydownEventHandler = this.makeSendPropertiesHandler([
            "ctrlKey",
            "metaKey",
            "shiftKey",
            "keyCode"
        ]);

        // The four arrow keys
        this.orbitKeys = {
            "37": true, // left
            "38": true, // up
            "39": true, // right
            "40": true // down
        };

        this.eventHandlers = {
            contextmenu: this.preventDefaultHandler.bind(this),
            mousedown: this.mouseEventHandler.bind(this),
            mousemove: this.mouseEventHandler.bind(this),
            mouseup: this.mouseEventHandler.bind(this),
            touchstart: this.touchEventHandler.bind(this),
            touchmove: this.touchEventHandler.bind(this),
            touchend: this.touchEventHandler.bind(this),
            wheel: this.wheelEventHandler.bind(this),
            keydown: this.filteredKeydownEventHandler.bind(this),
        };
    }

    wheelEventHandler(event, sendFn) {
        event.preventDefault();
        this.wheelEventHandlerImpl(event, sendFn);
    }

    preventDefaultHandler(event) {
        event.preventDefault();
    }

    copyProperties(src, properties, dst) {
        for (const name of properties) {
            dst[name] = src[name];
        }
    }

    makeSendPropertiesHandler(properties) {
        var that = this;
        return function sendProperties(event, sendFn) {
            const data = { type: event.type };
            that.copyProperties(event, properties, data);
            sendFn(data);
        };
    }

    touchEventHandler(event, sendFn) {
        const touches = [];
        const data = { type: event.type, touches };
        for (let i = 0; i < event.touches.length; ++i) {
            const touch = event.touches[i];
            touches.push({
                pageX: touch.pageX,
                pageY: touch.pageY
            });
        }
        sendFn(data);
    }


    filteredKeydownEventHandler(event, sendFn) {
        const { keyCode } = event;
        if (this.orbitKeys[keyCode]) {
            event.preventDefault();
            this.keydownEventHandler(event, sendFn);
        }
    }

    init(canvas, options) {
        const offscreen = canvas.transferControlToOffscreen();
        this.worker = new Worker();

        const proxy = new ElementProxy(canvas, this.worker, this.eventHandlers);
        this.worker.postMessage(
            {
                type: "start",
                canvas: offscreen,
                options: options,
                canvasId: proxy.id
            },
            [offscreen]
        );

        return this.worker;
    }
}

let nextProxyId = 0;
class ElementProxy {

    constructor(element, worker, eventHandlers) {

        this.id = nextProxyId++;
        this.worker = worker;

        const sendEvent = data => {
            this.worker.postMessage({
                type: "event",
                id: this.id,
                data
            });
        };

        // register an id
        worker.postMessage({
            type: "makeProxy",
            id: this.id
        });
        sendSize();
        for (const [eventName, handler] of Object.entries(eventHandlers)) {
            element.addEventListener(eventName, function (event) {
                handler(event, sendEvent);
            });
        }

        function sendSize() {
            const rect = element.getBoundingClientRect();
            sendEvent({
                type: "size",
                left: rect.left,
                top: rect.top,
                width: element.clientWidth,
                height: element.clientHeight
            });
        }

        // really need to use ResizeObserver
        window.addEventListener("resize", sendSize);
    }
}

export default DigitalTwinProxy;
