
import { services } from '../app/services';
import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder,Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { single } from 'rxjs';
@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  // name = signal ('');
  // solicitante = signal ('');
  // gerencia = signal ('');
  // cargo = signal ('');

  form;
  service: any;

  constructor(private fb: FormBuilder, service: services, private router: Router) {
    this.service = service;
    this.router = router;

    this.form = this.fb.group({
      cedula: [
        '',
        [
          Validators.required,
          Validators.pattern(/^[0-9]+$/),
          Validators.minLength(6),
          Validators.maxLength(10)
        ],
      ],
      email: ['', [Validators.required, Validators.email]],
      solicitante: ['', [Validators.required]],
      gerencia: ['', [Validators.required]],
      cargo: ['', [Validators.required]]
    });
  }


  get cedula() {
    return this.form.get('cedula');
  }

  get email() {
    return this.form.get('email');
  }

  numbers() {
    const valor = this.cedula?.value || '';
    const numbers = valor.replace(/\D/g, '');
    this.cedula?.setValue(numbers, { emitEvent: false });
  }


  consultar() {
    this.cedula?.markAsTouched();
    this.cedula?.markAsDirty();

    if (this.cedula?.invalid) {
      console.log("❌ Cédula inválida");
      return;
    }
    const cedulaValor = this.cedula?.value;
    console.log('✔ Consultando cédula:', cedulaValor);
  }


  sendinvitation() {
  this.form.markAllAsTouched();

  if (this.form.invalid) {
    console.log("❌ Formulario incompleto");
    return;
  }

  this.service.setData(this.form.value);
  this.router.navigate(['/invited']);

  console.log("✔ Datos guardados:", this.form.value);
  console.log('DataService', this.service);
  }
}
