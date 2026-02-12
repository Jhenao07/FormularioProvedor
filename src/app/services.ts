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
  private extractUrl = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract-rut';
  private statusUrl = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract/status';

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

  sendTokenEmail(email: string): Observable<any> {
  // Reemplaza con la URL real de tu API de envío de correos
  const url = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/send-token';
  return this.http.post(url, { email });
}


  startExtraction(file: File, docType: string): Observable<{executionId: string}> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('docType', docType);
    return this.http.post<{executionId: string}>(`${this.extractUrl}/extract-rut`, fd);
  }
  // --- API PDF Step 2: Consultar estado ---
  checkStatus(executionId: string): Observable<any> {
    return this.http.get<any>(`${this.statusUrl}?executionId=${executionId}`);
  }

  private handleError(error: any) {
    console.error('Error en la petición:', error);
    return throwError(() => error);
  }

  private data: any;
  setData(value: any): void {
    this.data = value;
  }

  getData(): any {
    return this.data;
  }
}

