declare global {
    const firebase: typeof import('firebase/compat/app').default
    const Swal: typeof import('sweetalert2').default
    const LZString: {
        compress: (input: string) => string
        decompress: (compressed: string) => string
        compressToUTF16: (input: string) => string
        decompressFromUTF16: (compressed: string) => string
        compressToEncodedURIComponent: (input: string) => string
        decompressFromEncodedURIComponent: (compressed: string) => string
    }
    const tailwind: any
}

export { }
