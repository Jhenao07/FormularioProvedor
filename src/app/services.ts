import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { EmployeesResponse } from './interface/employees.interface';
@Injectable({
  providedIn: 'root'
})
export class services {

  private apiUrl =
    'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/plumbing/employees/getEmployeeByParam';
  constructor(private http: HttpClient) {}

search(documentNumber: string): Observable<EmployeesResponse> {
  return this.http.get<EmployeesResponse>(
    `${this.apiUrl}?documentNumber=${documentNumber}`
  ).pipe(
    catchError(error => {
      console.error('Error en API:', error);
      return throwError(() => error);
    })
  );
}

  private data: any;
  setData(value: any): void {
    this.data = value;
  }

  getData(): any {
    return this.data;
  }
}

