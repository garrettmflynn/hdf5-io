export declare function getAllPropertyNames(obj: any): string[];
export declare type extendedObject = (String | Number | Boolean | Object) & {
    [x: string | symbol]: any;
};
export declare const objectify: (value: any) => extendedObject;
