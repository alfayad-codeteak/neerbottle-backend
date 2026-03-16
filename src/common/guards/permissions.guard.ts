import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Protects admin routes: both owner and admin roles can access all admin routes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (user.role === 'owner' || user.role === 'admin') {
      return true;
    }
    throw new ForbiddenException('Owner or admin access required');
  }
}
