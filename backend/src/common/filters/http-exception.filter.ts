import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { FastifyReply } from 'fastify'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    // Log unexpected (non-HTTP) errors with their stack so 500s are diagnosable.
    if (!(exception instanceof HttpException)) {
      const err = exception as { stack?: string; message?: string }
      this.logger.error(`Unhandled error: ${err?.message ?? exception}`, err?.stack)
    }

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' }

    reply.status(status).send(
      typeof message === 'object'
        ? message
        : { statusCode: status, message },
    )
  }
}
