import * as h5 from "h5wasm";
import { FileProxyOptions } from "./lazy/FileProxy";
import { Callbacks } from "./types";
export declare type ArbitraryObject = {
    [x: string | symbol]: any;
};
export declare type IOInput = {
    debug?: boolean;
    postprocess?: Function;
};
export * from './utils/properties';
export * from './globals';
declare type FetchOptions = {
    useLocalStorage?: boolean | FileProxyOptions;
    useStreaming?: boolean;
} & Callbacks;
declare type UploadOptions = {
    multiple?: boolean;
};
declare type Options = {
    filename?: string;
} & UploadOptions & FetchOptions;
declare type FileType = {
    [key: string | symbol]: any;
    indexedDBFilenameSymbol: string;
};
declare type FileObject = {
    name: string;
    file?: FileType;
    reader?: h5.File;
    url?: string;
};
export default class HDF5IO {
    #private;
    files: Map<string, FileObject>;
    _path: string;
    _debug: boolean;
    __postprocess: Function;
    _extension?: string;
    _mimeType: string;
    constructor(options?: IOInput);
    _convertPath: (path: string) => string;
    initFS: (path?: string) => Promise<unknown>;
    syncFS: (read?: boolean, path?: string) => Promise<unknown>;
    upload: (ev?: Event | FileList | null | undefined, options?: UploadOptions) => any;
    list: (path?: string) => Promise<any[]>;
    blob: (file?: any) => Blob | undefined;
    arrayBuffer: (file?: any) => any;
    download: (input: string | FileType, file?: any) => void;
    stream: (url: string, name: string, options?: FileProxyOptions | undefined, callbacks?: Callbacks | undefined) => Promise<any>;
    resolveStream: (o: any) => Promise<any>;
    fetch: (url: string, filename: Options['filename'], options?: FetchOptions) => any;
    parse: (o: any, aggregator: {
        [x: string]: any;
    } | undefined, key: string, keepDatasets?: boolean) => any;
    load: (name?: string | null | undefined, options?: Options | undefined) => any;
    get: (name: string, mode?: "w" | "r" | "a" | "x" | "Sw" | "Sr" | undefined, useLocalStorage?: Options['useLocalStorage']) => FileObject;
    save: (o: ArbitraryObject, name?: string, limit?: boolean) => Promise<string | false>;
    close: (name?: string | undefined) => void;
}
