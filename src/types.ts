export type progressCallback = (ratio: number, length: number, id: string) => void 
export type successCallback = (fromRemote: boolean, id: string) => void 

export type Callbacks = {
    progressCallback?: progressCallback
    successCallback?: successCallback
}

export type ArbitraryObject = { [x: string | symbol]: any }
