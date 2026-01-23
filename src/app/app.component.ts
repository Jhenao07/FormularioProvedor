
import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { FormBuilder,Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { services } from './services';
import { EmployeesResponse, Employee} from './interface/employees.interface';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
    
}
