export declare type progressCallback = (ratio: number, length: number, id: string) => void;
export declare type successCallback = (fromRemote: boolean, id: string) => void;
export declare type Callbacks = {
    progressCallback?: progressCallback;
    successCallback?: successCallback;
};
