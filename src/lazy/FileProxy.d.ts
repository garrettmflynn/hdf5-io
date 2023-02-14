import { Callbacks } from '../types';
export declare type FileProxyOptions = {
    LRUSize?: number;
    requestChunkSize?: number;
};
declare class FileProxy {
    #private;
    url: string;
    worker: Worker;
    options: FileProxyOptions;
    callbacks: Callbacks;
    file: any;
    constructor(url?: string, options?: FileProxyOptions, callbacks?: Callbacks);
    set: (url?: string | undefined, options?: FileProxyOptions | undefined, callbacks?: Callbacks | undefined) => void;
    get: (path?: string) => Promise<any>;
    load: (url?: string | undefined, options?: FileProxyOptions | undefined, callbacks?: Callbacks | undefined) => Promise<any>;
    send: (o: any) => Promise<unknown>;
}
export default FileProxy;
