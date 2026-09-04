export function randomSelection<T>(array: T[], amount: number): T[] {
    amount = Math.min(amount, array.length / 2)
    const selection: T[] = []
    for (let i = 0; i < amount; i++) {
        while (true) {
            const randomItem = array[Math.floor(Math.random() * array.length)]
            if (!selection.includes(randomItem)) {
                selection.push(randomItem)
                break
            }
        }
    }
    return selection
}

export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename

    document.body.append(a)
    a.click()
    a.remove()

    URL.revokeObjectURL(url)
}

export function saveText(text: string, filename: string): void {
    const blob = new Blob([text], {type: 'text/plain'})
    saveBlob(blob, filename)
}
