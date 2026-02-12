import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { FormBuilder,Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { services } from '../services';
import { EmployeesResponse, Employee } from '../interface/employees.interface';

@Component({
  selector: 'app-form',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './form.component.html',
  styleUrl: './form.component.css'
})

export class FormComponent {
    EmployeesResponse!: EmployeesResponse;
    name = signal ('');
    Employee = signal <Employee | null>(null);
    position = signal ('');
    area = signal ('');
    management = signal ('');


  form: FormGroup;

  constructor(private fb: FormBuilder, private service: services, private router: Router) {
     this.form = this.fb.group({
    documentNumber: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9]+$/),
        Validators.minLength(6),
        Validators.maxLength(10)
      ],
    ],
    email: ['', [Validators.required, Validators.email]],
    name: [''],
    gerencia: [''],
    position: [''],
    observations: [''],
    sentAnt: [new Date()],
    area: [''],
    providerType: ['']
  });
}
  selectChip(value: string): void {
  this.form.get('providerType')?.setValue(value);
}
// ===== Getters =====
get documentNumber() {
  return this.form.get('documentNumber');
}

get email() {
  return this.form.get('email');
}


numbers() {
  const valor = this.documentNumber?.value || '';
  const numbers = valor.replace(/\D/g, '');
  this.documentNumber?.setValue(numbers, { emitEvent: false });
}

search(): void {
  this.documentNumber?.markAsTouched();

  if (this.documentNumber?.invalid) {
    console.log('❌ Cédula inválida');
    return;
  }

  const documentNumber = this.documentNumber?.value || '';

  this.service.search(documentNumber).subscribe({
    next: (res: EmployeesResponse) => {
      if (!res.users || res.users.length === 0) {
        console.error('❌ No se encontró empleado');
        return;
      }

      const employee = res.users[0];

      this.form.patchValue({
        name: employee.name,
        gerencia: employee.management,
        position: employee.position,
        area: employee.area,
        email: employee.email
      });

      console.log('✔ Datos cargados correctamente');
    },
    error: (err) => {
      console.error('❌ Error consultando API', err);
    }
  });
}

// ===== ENVIAR INVITACIÓN =====
sendinvitation(): void {
  this.form.markAllAsTouched();

  if (this.form.invalid) {
    console.log('❌ Formulario incompleto');
    return;
  }

  this.service.setData(this.form.value);
  sentAnt: new Date();
  this.router.navigate(['/invited']);

  console.log('✔ Datos guardados:', this.form.value);
}
}
