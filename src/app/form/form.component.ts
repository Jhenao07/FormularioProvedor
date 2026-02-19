import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { services } from '../services'; // Asegúrate de la ruta correcta
import { EmployeesResponse, Employee } from '../interface/employees.interface';
import Swal from 'sweetalert2';


@Component({
  selector: 'app-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './form.component.html',
  styleUrl: './form.component.css'
})
export class FormComponent {
  EmployeesResponse!: EmployeesResponse;

  // Signals para UI (opcionales si usas form reactivo, pero los dejo si los usas en el HTML)
  name = signal('');
  Employee = signal<Employee | null>(null);
  position = signal('');
  area = signal('');
  management = signal('');

  form: FormGroup;
  private elementRef = inject(ElementRef);

  // Estados del Dropdown Personalizado
  dropdownOpen = false;
  selectedFlag: string | null = null;
  selectedCountryCode: string = 'co';

  // Lista unificada de países (Asegúrate de tener las imágenes en assets/flags/)
  countriesList = [
    { name: 'Colombia', flag: 'assets/co.png', code: 'CO' },
    { name: 'Estados Unidos', flag: 'assets/us.png', code: 'USA' },
    { name: 'México', flag: 'assets/mx.png', code: 'MX' },
    { name: 'España', flag: 'assets/es.png', code: 'ES' },
    { name: 'Alemania', flag: 'assets/de.png', code: 'DE' },
    { name: 'Otro', flag: 'assets/otro.png', code: '' },
  ];

  constructor(
    private fb: FormBuilder,
    private service: services,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.form = this.fb.group({
      documentNumber: ['', [
          Validators.required,
          Validators.pattern(/^[0-9]+$/),
          Validators.minLength(6),
          Validators.maxLength(10)
      ]],
      email: ['', [Validators.required, Validators.email]],
      name: ['', Validators.required],
      gerencia: ['', Validators.required],
      position: ['', Validators.required],
      observations: [''],
      sentAnt: [new Date()],
      area: [''],
      country: ['', Validators.required],     // Campo clave para el dropdown
      providerType: ['', Validators.required], // Chips
      classification: ['',] // Select de clasificación
    });
  }

  // =========================================================
  // LÓGICA DEL DROPDOWN PERSONALIZADO (PRO)
  // =========================================================

  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    // Cierra el dropdown si el clic fue fuera del componente
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }

  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
  }

    selectCountry(country: any) {
        this.dropdownOpen = false;
        this.selectedFlag = country.flag;

        // Actualizamos el valor legible para el formulario
        this.form.patchValue({ country: country.name });
        this.form.get('country')?.markAsTouched();

        // Guardamos el código ISO (CO, MX, etc.)
        this.selectedCountryCode = country.code.toUpperCase(); // Forzamos Mayúsculas para el backend

        // Actualizamos la URL local si es necesario, pero ahora usando 'sn'
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { sn: this.selectedCountryCode },
          queryParamsHandling: 'merge'
        });
      }

  // =========================================================
  // LÓGICA DE NEGOCIO Y FORMULARIO
  // =========================================================

  selectChip(value: string): void {
    this.form.get('providerType')?.setValue(value);
  }

  // Getters
  get documentNumber() { return this.form.get('documentNumber'); }
  get emailControl() { return this.form.get('email'); }

  // Solo permite números en la cédula
  numbers() {
    const valor = this.documentNumber?.value || '';
    const numbers = valor.replace(/\D/g, '');
    this.documentNumber?.setValue(numbers, { emitEvent: false });
  }

  // Busca el empleado en la API
  search(): void {
    this.documentNumber?.markAsTouched();
    if (this.documentNumber?.invalid) return;

    this.service.search(this.documentNumber?.value).subscribe({
      next: (res: EmployeesResponse) => {
        if (res.users && res.users.length > 0) {
          const emp = res.users[0];
          this.form.patchValue({
            name: emp.name,
            gerencia: emp.management,
            position: emp.position,
            area: emp.area,
          });
        } else {
            console.error('Usuario no encontrado');
        }
      },
      error: (err) => console.error('Error API Empleados:', err)
    });
  }


  private getFormattedDate(): string {
    const d = new Date();
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  sendinvitation(): void {
    this.form.markAllAsTouched();
        if (this.form.invalid) {

          alert('Por favor completa todos los campos requeridos (marcados en rojo).');

          return;

        }

    const raw = this.form.getRawValue();

    const payload = {
      "commercialOperationType": "SR",
      "observations": raw.email,
      "dataFields": [
        {
          "labelIdField": "requestedBy",
          "valueField": raw.name
        },
        {
          "labelIdField": "managementWhichItBelongs",
          "valueField": raw.gerencia
        },
        {
          "labelIdField": "ApplicantPosition",
          "valueField": raw.position
        },
        {
          "labelIdField": "supplierType",
          "valueField": raw.providerType
        },
        {
          "labelIdField": "supplierClassification",
          "valueField": raw.classification
        },
        {
          "labelIdField": "date",
          "valueField": this.getFormattedDate()
        },
        {
          "labelIdField": "isCounterpartySelect",
          "valueField": "No"
        },
        {
            "labelIdField": "supplierLocation",
            "valueField": raw.country
        }
      ]
    };

    console.log('📤 JSON a enviar:', JSON.stringify(payload, null, 2));



    this.service.createInvitation(payload).subscribe({
      next: (res) => {
        this.service.setData(payload);

        // 🚀 NAVEGACIÓN LIMPIA DESDE EL INICIO
        // Aquí es donde definimos que country NO exista y sn SÍ.
        this.router.navigate(['/invited'], {
          queryParams: {
            oc: res.orderServerId,
            os: res.orderServerId,
            sn: this.selectedCountryCode // Usamos 'sn' en lugar de 'country'
          }
          // Quitamos 'merge' para asegurar que la URL se limpie de parámetros viejos
        });
      },
      error: (err: any) => {
        const mensajeBackend = err.error?.message || 'Ocurrió un error inesperado.';
        Swal.fire({
          icon: 'error',
          title: 'Atención',
          text: mensajeBackend,
          confirmButtonColor: '#d33'
        });
      }
    });
  }
}

