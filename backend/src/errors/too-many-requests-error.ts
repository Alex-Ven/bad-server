class TooManyRequestsError extends Error {
    public statusCode: number

    public retryAfter: number // Время, через которое можно повторить

    constructor(
        message: string = 'Слишком много запросов',
        retryAfter: number = 900
    ) {
        super(message)
        this.statusCode = 429
        this.retryAfter = retryAfter // 15 минут в секундах
    }
}
export default TooManyRequestsError
