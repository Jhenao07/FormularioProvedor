
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root'
})
export class services {

  private apiUrl = 'https://ccwhqcbjae.execute-api.us-east-1.amazonaws.com/api/plumbing/employees/getEmployeeByParam';
  constructor(private http: HttpClient) { }

  private data: any = null;

  setData(data: any) {
    this.data = data;
  }

  getData() {
    return this.data;
  }
}
