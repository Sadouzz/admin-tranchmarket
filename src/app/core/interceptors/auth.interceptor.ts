import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  const isMedusaRequest =
    req.url.startsWith(environment.medusaBackendUrl) ||
    req.url.includes('/admin') ||
    req.url.includes('/auth');

  if (isMedusaRequest) {
    let headers = req.headers;
    const token = typeof window !== 'undefined' ? localStorage.getItem('tm_admin_token') : null;

    if (token && !headers.has('Authorization')) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    // Always include withCredentials: true for HttpOnly cookies
    const clonedReq = req.clone({
      headers,
      withCredentials: true,
    });

    return next(clonedReq).pipe(
      catchError((error: HttpErrorResponse) => {
        // If 401 Unauthorized on protected routes (not on login or session endpoints itself)
        const isAuthRoute =
          req.url.includes('/auth/user/emailpass') ||
          req.url.includes('/auth/session');

        if (error.status === 401 && !isAuthRoute) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('tm_admin_token');
            localStorage.removeItem('tm_admin_user');
          }
          router.navigate(['/login']);
        }
        return throwError(() => error);
      })
    );
  }

  return next(req);
};
