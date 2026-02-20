import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { EmployeesResponse } from './interface/employees.interface';
@Injectable({
  providedIn: 'root'
})
export class services {

  private apiUrl =
  'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/plumbing/employees/getEmployeeByParam';
  private statusUrl = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract/status';
  private apiValidarOrden = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/validateOpenSO/';




  constructor(private http: HttpClient) {}

  private invitedUrl = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/ntp/commercialOperation/v1/createCompleteOrder/SR';

  createInvitation(payload: any): Observable<any> {
  console.log("🚀 Disparando petición REAL a AWS con este payload:", payload);
  const myToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjExM2UyNDNjLTczZjctNGM4NC05MDE1LWU3NWRkZGFiZDI3MSIsImRhdGEiOiIyN2VmOWRiOTg0OTNhYzBiYjFkMmQ1YjJhYjVhZWFjMWViZjY1NDFhYjE4NGVmNTdmYzU3MGFkZmJhM2M1ODY3ODNmMjBhZjg0ZmQ5Y2ZmYWU3NzljYTY5NmRjMDRlZDFjODRiMzRiZjQyNWU4MTJjMDI3MmZmYjdlNTA1Yjg1YjgxNDFmMzc5NGIzNmEyNTEwYjBmODE4Njg0MzhmZGQ0YWUxYmJiMzJiZjIzMDg3OWRmZWQwMDIwYTJjYzdjOTQ0YjhhNGYxYzM0NDA1ZTRhNWRiY2I0NzA4NTc1NzFhZTYxMWZlMWQyYjYzM2YzNWNkMmExZjMyODI5OTljN2FjZjI4MjNiZjJmOTA1N2JiNDZjZjFlMzExNzg2MDQ0ZWZlOGNkYjA5YmM2YzliMjdlNmEyZDYyYjBhNzFjZjcyNGRhY2I2NGJmNzI4MTZkNmQ0ZTJjYTA1NzRmZjJiYjljODc3ZWJkMjhkNzZhZDMzMDA1NzlmMGZmYTlhMTliYWU2M2UwZWJiN2VmZGFhYTlhNjI4NDEzMGJlMzU5MmY3M2Q3ODIwYzQ0MTg2ZGEzMmNlMzBiNzJhYTc2MDIyYWMzZWVlYjI5MDRlNWNlZWU1YTI5OGQxYTIwNzAwZTM3NWFiMWRkMWEzMzcyMjU3NjFjOGIzMTRlOTE0MzM4MzgzMWVkNDJkZmFkNWQwOGMwOTRkZDg1ZDY4YTU4NTAwYmYzZTY5YWEzMmYyN2IyNjU0ZTBiOWI3MzUyMmU5Njc3MzRlZWNiZTUxMTIwMWJmOTFjY2RkOTJlMGQxMjE5YjFjNTFhZGRhODk0Y2U0ZjQ3ODhjODg5YjkwZTllYmY2YmM1OTlhZDkwZDdhNWY2YWQ4YjJkM2ViYzRmN2ZhMWMzZmEwNDJhMWRlOTAwNjhjN2U2YjEyNjhjZTlkNjdmZGUyYWQwMWNmMjg1N2Q2OWNiNDQ2NTIxNThjYzlkZmQ3YWI5MDNkM2Q5YTZmYmQ5N2Q4MDVhYzc4MDI5NTlhY2ZjZDZjMmQwMThlZTdmYzJjMDRkOGNmNzFjNDRlZTlhNGZhNjY1MDM4YjQyZjcwZTQ4NTAwZGNkMTliYTA5MzM0MzZlOWFkYWYxYzlmOWJlYzM0ZjQ2NDY1NmI0YzJhZjg4YTYyNWI5ZTZmNzcyZTNhYTFkMTZhNDU3YzdjZWFhOWU0ZTQ5N2ZhY2Y0YmRkNmVmZWI2NDMzYTNkZDNmY2FiNDBkZmM4NTViOThkMTI2ZmY5ZmIyMWJiZDBmMTcwNzgyYjEyZjQ0ODk5OGQwZGQ1NDk1YjMzODU3ODViMjU1MmU1YmZhMTUyMDhmNGNiNzhjMTc4ZmNhNDkxYjhhZTc5ZDliOTI5ZmE2NWJlZWZlZmQzMTg4NmUzZGVjOGViNzUzMzkiLCJ0eXBlIjoidXNlciIsImlhdCI6MTc3MTI1OTA0NiwiZXhwIjoxNzcxODYzODQ2fQ.3zDVpOqowZahtbVOEUF_2Q2zjJ4G6pp2tX1iNGpfT3w';

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${myToken}`
    });
  return this.http.post(this.invitedUrl, payload, { headers });
  }

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

  validarEstadoOrden(oc: string, os: string): Observable<any> {
  const url = `${this.apiValidarOrden}?oc=${oc}&os=${os}`;
  return this.http.get<any>(url, { observe: 'response' }).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 302) {
        return of({ status: 302, body: error.error });
      }
      return throwError(() => error);
    })
  );
}

  sendTokenEmail(email: string): Observable<any> {
  // Reemplaza con la URL real de tu API de envío de correos
    const url = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/send-token';
    return this.http.post(url, { email });
  }

    private extractUrl = 'https://3l5btwx64e.execute-api.us-east-1.amazonaws.com/api/pdf-services/pdf-extract-fields/extract-rut';

    startExtraction(file: File, docType: string): Observable<any> {
    const pdfToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjczM2VhNDNhLTc4N2QtNDM4Yi04ZTAwLTU0ZDc0YjVlMGRkOSIsImRhdGEiOiIzMzY0MDBlZWI0MWVjYzAwYWMwYmVkODZlNjk2YTk5OSIsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzY4NjkzMTM2LCJleHAiOjIwODQyNjkxMzZ9.qZn1fMZMfxJvx90t6huKa_saFKzBKYpU0MrBzpVonMY';
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${pdfToken}`
    });

    const fd = new FormData();
    fd.append('file', file);
    fd.append('render', JSON.stringify({ "dpi": 200, "pages": "1" }));
   
    return this.http.post<any>(this.extractUrl, fd, { headers });
    }

  // --- API PDF Step 2: Consultar estado ---
    checkStatus(jobId: string): Observable<any> {
      const pdfToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjczM2VhNDNhLTc4N2QtNDM4Yi04ZTAwLTU0ZDc0YjVlMGRkOSIsImRhdGEiOiIzMzY0MDBlZWI0MWVjYzAwYWMwYmVkODZlNjk2YTk5OSIsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzY4NjkzMTM2LCJleHAiOjIwODQyNjkxMzZ9.qZn1fMZMfxJvx90t6huKa_saFKzBKYpU0MrBzpVonMY';

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${pdfToken}`
      });

      // Nota: Revisa si tu backend espera ?jobId= o ?executionId=. Lo dejaré como executionId que era el que tenías.
    return this.http.get<any>(`${this.statusUrl}?jobId=${jobId}`, { headers });
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

