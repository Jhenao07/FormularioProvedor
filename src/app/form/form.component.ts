import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { services } from '../services';
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

  form: FormGroup;
  private elementRef = inject(ElementRef);
  private fb         = inject(FormBuilder);
  private service    = inject(services);
  private router     = inject(Router);
  private route      = inject(ActivatedRoute);

  // ── UI State ──────────────────────────────────────────────
  dropdownOpen = false;
  selectedFlag: string | null = null;
  selectedCountryCode: string = '';
  isSearching = signal(false);
  isSending   = signal(false);

  // ── Opciones ──────────────────────────────────────────────
  readonly providerTypes = ['Repuestos', 'Servicios', 'Asesoría / Consultoría', 'Maquinaria', 'Otros'];

  readonly classificationOptions = [
    'Agencia de Aduanas Nivel 1',
    'Agencia de Aduanas Nivel 2',
    'Gran Empresa',
    'Mediana Empresa',
    'Microempresa',
    'Pequeña Empresa',
    'Persona Natural',
  ];

  readonly countriesList = [
    { name: 'Colombia',       flag: 'assets/co.png',   code: 'CO'  },
    { name: 'Estados Unidos', flag: 'assets/us.png',   code: 'USA' },
    { name: 'México',         flag: 'assets/mx.png',   code: 'MX'  },
    { name: 'España',         flag: 'assets/es.png',   code: 'ES'  },
    { name: 'Alemania',       flag: 'assets/de.png',   code: 'DE'  },
    { name: 'Otro',           flag: 'assets/otro.png', code: ''    },
  ];

  constructor() {
    this.form = this.fb.group({
      documentNumber: ['', [
        Validators.required,
        Validators.pattern(/^[0-9]+$/),
        Validators.minLength(7),
        Validators.maxLength(11)
      ]],
      email:          ['', [Validators.required, Validators.email]],
      name:           ['', Validators.required],
      agency:         ['', Validators.required],
      position:       ['', Validators.required],
      area:           [''],
      observations:   ['', Validators.maxLength(300)],
      country:        ['', Validators.required],
      providerType:   ['', Validators.required],
      classification: [''],
      otherType:      [''],
    });
  }

  // ── Getters ───────────────────────────────────────────────
  get documentNumber() { return this.form.get('documentNumber'); }
  get emailControl()   { return this.form.get('email'); }
  get obsLength()      { return this.form.get('observations')?.value?.length ?? 0; }

  // ── Dropdown país ─────────────────────────────────────────
  @HostListener('document:click', ['$event'])
  clickOutside(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.dropdownOpen = false;
    }
  }

  toggleDropdown() { this.dropdownOpen = !this.dropdownOpen; }

  selectCountry(country: any) {
    this.dropdownOpen     = false;
    this.selectedFlag     = country.flag;
    this.selectedCountryCode = country.code.toUpperCase();
    this.form.patchValue({ country: country.name });
    this.form.get('country')?.markAsTouched();
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sn: this.selectedCountryCode },
      queryParamsHandling: 'merge'
    });
  }

  // ── Chips tipo proveedor ──────────────────────────────────
  selectChip(value: string): void {
    this.form.get('providerType')?.setValue(value);
    if (value !== 'Otros') this.form.get('otherType')?.setValue('');
  }

  // ── Solo números en cédula ────────────────────────────────
  numbers() {
    const val = this.documentNumber?.value ?? '';
    this.documentNumber?.setValue(val.replace(/\D/g, ''), { emitEvent: false });
  }

  // ── Buscar empleado ───────────────────────────────────────
 search(): void {
    this.documentNumber?.markAsTouched();
    if (this.documentNumber?.invalid) return;

    this.isSearching.set(true);
    this.service.search(this.documentNumber?.value).subscribe({
      next: (res: EmployeesResponse) => {
        this.isSearching.set(false);

        if (res && res.users && res.users.length > 0) {
          const emp = res.users[0];
          this.form.patchValue({
            name:     emp.name,
            agency:   emp.agency,
            position: emp.position,
            area:     emp.area,
          });
        } else {
          // 🧹 Limpiamos los campos en caso de que hubiera datos de una búsqueda anterior
          this.form.patchValue({ name: '', agency: '', position: '', area: '' });

          // 🟡 Alerta de Cédula No Encontrada
          Swal.fire({
            icon: 'warning',
            title: 'Cédula no encontrada',
            text: 'No logramos encontrar un empleado con esta cédula. Por favor, verifique que esté escrita correctamente.',
            confirmButtonColor: '#FF6647'
          });
        }
      },
      error: () => {
        this.isSearching.set(false);

        // 🧹 También limpiamos si hay error
        this.form.patchValue({ name: '', agency: '', position: '', area: '' });

        // 🔴 A veces el backend devuelve un error 404 en lugar de un arreglo vacío cuando no encuentra a la persona
        Swal.fire({
          icon: 'error',
          title: 'Error de consulta',
          text: 'No pudimos encontrar la cédula o hubo un error de conexión. Por favor, verifique el número e intente de nuevo.',
          confirmButtonColor: '#FF6647'
        });
      }
    });
  }

  // ── Enviar invitación ─────────────────────────────────────
  sendinvitation(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.isSending.set(true);
    const raw = this.form.getRawValue();
    const providerTypeValue = raw.providerType === 'Otros'
      ? (raw.otherType?.trim() || 'Otros')
      : raw.providerType;

    const payload = {
      commercialOperationType: 'SR',
      observations: raw.email,
      dataFields: [
        { labelIdField: 'requestedBy',             valueField: raw.name           },
        { labelIdField: 'managementWhichItBelongs', valueField: raw.agency        },
        { labelIdField: 'ApplicantPosition',        valueField: raw.position      },
        { labelIdField: 'supplierType',             valueField: providerTypeValue  },
        { labelIdField: 'supplierClassification',   valueField: raw.classification },
        { labelIdField: 'date',                     valueField: this.getFormattedDate() },
        { labelIdField: 'isCounterpartySelect',     valueField: 'No'              },
        { labelIdField: 'supplierNationality',      valueField: this.selectedCountryCode },
      ]
    };

   this.service.createInvitation(payload).subscribe({
      next: (res: any) => {
        // 🟢 Guardamos el email junto al payload para que registerprovider lo lea

        // 🌟 1. ATRAPAMOS LA NUEVA ESTRUCTURA DEL JSON DEL BACKEND
        const commercialOpId = res.commercialOp?.id;                 // UUID para 'oc'
        const orderServerId = res.serviceOrder?.orderServerId;       // UUID para 'os'
        const numServiceOrder = res.serviceOrder?.numServiceOrder;   // Código NUSR... para 'numSo'

        // 🟢 Codificamos el email en Base64 — no viaja legible en la URL
        const em = btoa(raw.email);

        // 🌟 2. MANDAMOS LOS 5 PARÁMETROS EN LA URL
        this.router.navigate(['/invited'], {
          queryParams: {
            oc: commercialOpId,
            os: orderServerId,
            numSo: numServiceOrder,
            sn: this.selectedCountryCode,
            em  // email en Base64
          }
        });

        console.log('✅ Invitación creada. Parámetros listos para la URL:', {
          oc: commercialOpId,
          os: orderServerId,
          numSo: numServiceOrder,
          sn: this.selectedCountryCode,
          em
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

  private getFormattedDate(): string {
    const d = new Date();
    return [d.getDate(), d.getMonth() + 1, d.getFullYear()]
      .map((n, i) => i < 2 ? String(n).padStart(2, '0') : n)
      .join('/');
  }
}
