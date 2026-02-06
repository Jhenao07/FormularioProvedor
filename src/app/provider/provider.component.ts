import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ProgressOverlayComponent } from '../components/progress-overlay/progressOverlay.component';
import { interval, Subscription } from 'rxjs';

// Interfaz para la respuesta del API (Tipado fuerte)
interface ExtractedData {
  nombres?: string;
  apellidos?: string;
  numeroDocumento?: string;
  message?: string;
}

@Component({
  selector: 'app-provider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ProgressOverlayComponent, HttpClientModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css'
})
export class ProviderComponent {

  // Inyección de dependencias moderna
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private destroyRef = inject(DestroyRef);

  // --- Señales y Estado ---
  previewUrl?: string;
  infiniteOverlayOpen = signal(false);
  infiniteProgress = signal(0);

  // Archivos en signals para reactividad interna
  fileRut = signal<File | null>(null);
  fileBancaria = signal<File | null>(null);

  arrayItems = signal([
    {title: 'Documento de Identidad', key: 'rut'},
    {title: 'Cámara de Comercio', key: 'camara'},
    {title: 'Certificación Bancaria', key: 'bancaria'}
  ]);

  // --- Variables públicas para el HTML (NO TOCAR NOMBRES) ---
  overlayOpen = false;
  overlayTitle = 'Procesando...';
  overlaySubtitle: string | null = null;
  overlayIndeterminate = true;
  overlayCurrent = 0;
  overlayTotal = 0;
  overlayClosable = false;

  providerType: 'juridica' | 'natural' = 'juridica';
  currentStep = 1;
  form: FormGroup;

  // Timer para la barra infinita
  private infiniteSubscription?: Subscription;

  constructor() {
    this.form = this.fb.group({
      step1: this.fb.group({
        providerType: ['', Validators.required]
      }),
      step2: this.fb.group({
        rut: [null],
        camara: [null],
        bancaria: [null]
      }, {
        validators: ProviderComponent.atLeastOneFileValidator
      }),
      step3: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required],
        legalRepName: ['', Validators.required],
        riskOption: ['NA', Validators.required],
        riskWhich: ['']
      }),
      step4: this.fb.group({})
    });
  }

  // --- Validadores Estáticos ---
  static atLeastOneFileValidator(control: AbstractControl) {
    const value = control.value;
    if (!value) return { required: true };

    const hasFile = Object.values(value).some(v => v instanceof File);
    return hasFile ? null : { required: true };
  }

  // --- Lógica del Overlay Infinito (Mejorada con RxJS) ---
  openInfiniteOverlay() {
    this.infiniteOverlayOpen.set(true);
    this.infiniteProgress.set(0);

    // Usamos RxJS interval para un timer más estable y limpio
    this.infiniteSubscription = interval(60).pipe(
      takeUntilDestroyed(this.destroyRef) // Se limpia si el componente se destruye
    ).subscribe(() => {
      let val = this.infiniteProgress() + 1;
      if (val > 100) val = 0;
      this.infiniteProgress.set(val);
    });
  }

  closeInfiniteOverlay() {
    this.infiniteOverlayOpen.set(false);
    this.infiniteSubscription?.unsubscribe();
    this.infiniteProgress.set(0);
  }

  // --- Manejo de Archivos ---
  onFileSelected(event: Event, docType: string) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const control = this.form.get(`step2.${docType}`);

    if (!control) return;

    // Actualizamos signals internos según corresponda
    if (docType === 'rut') this.fileRut.set(file);
    if (docType === 'bancaria') this.fileBancaria.set(file);

    // Lectura opcional para debug (Mantenido pero optimizado)
    const reader = new FileReader();
    reader.onload = () => { /* Aquí podrías previsualizar si quisieras */ };
    reader.readAsText(file);

    // Actualización del formulario
    control.setValue(file);
    control.markAsTouched();
    control.markAsDirty();

    // Solo actualizamos la validez del grupo padre, no todo el form
    this.form.get('step2')?.updateValueAndValidity();
  }

  // --- Procesamiento de PDF (HTTP) ---
  procesarPdf(docType: 'rut' | 'camara' | 'bancaria') {
    const file = this.form.get(`step2.${docType}`)?.value as File;

    if (!file) {
      console.warn('No hay PDF seleccionado');
      return;
    }

    // Configuración UI
    this.overlayOpen = true;
    this.overlayTitle = 'Procesando PDF';
    this.overlaySubtitle = 'Analizando el documento…';
    this.overlayIndeterminate = true;
    this.overlayClosable = false;

    const fd = new FormData();
    fd.append('docType', docType);
    fd.append('file', file, file.name);

    this.http.post<ExtractedData>('/api/pdf/extract', fd)
      .pipe(takeUntilDestroyed(this.destroyRef)) // Evita memory leaks
      .subscribe({
        next: (data) => {
          this.applyExtractedDataToForm(data, docType);

          // Pequeño delay para UX suave
          setTimeout(() => {
            this.overlayOpen = false;
            this.overlaySubtitle = null;
          }, 200);
        },
        error: (err) => {
          console.error('Error backend:', err);
          this.overlayTitle = 'Error procesando PDF';
          // Manejo seguro del mensaje de error
          this.overlaySubtitle = err?.error?.message || 'No se pudo extraer información.';
          this.overlayIndeterminate = false;
          this.overlayClosable = true;
        }
      });
  }

  removeFile(docType: string) {
      const control = this.form.get(`step2.${docType}`);

      if (control) {
        // 1. Limpiamos el valor en el Form Group
        control.setValue(null);
        control.markAsPristine();
        control.markAsUntouched();

        // 2. Limpiamos los signals internos
        if (docType === 'rut') this.fileRut.set(null);
        if (docType === 'bancaria') this.fileBancaria.set(null);

        // 3. Notificamos el cambio de validez
        this.form.get('step2')?.updateValueAndValidity();

        // 4. RESET NATIVO: Limpiamos el input del DOM
        const inputElement = document.getElementById(`file-input-${docType}`) as HTMLInputElement;
        if (inputElement) {
          inputElement.value = '';
        }
      }
    }


  private applyExtractedDataToForm(data: ExtractedData, docType: string) {
    // Usamos patchValue con los datos tipados
    this.form.patchValue({
      step3: {
        nombres: data.nombres ?? '',
        apellidos: data.apellidos ?? '',
        numeroDocumento: data.numeroDocumento ?? '',
      }
    });
  }

  onOverlayClose() {
    this.overlayOpen = false;
  }

  // --- Getters para el HTML ---
  get tienePdfRut(): boolean {
    const file = this.form.get('step2.rut')?.value;
    return file instanceof File && file.type === 'application/pdf';
  }

  get providerTypes(): string {
    return this.form.get('step1.providerType')?.value;
  }

  // --- Navegación (Steps) ---
  nextStep() {
    const currentGroup = this.getCurrentStepGroup();
    if (!currentGroup) return;

    if (currentGroup.invalid) {
      currentGroup.markAllAsTouched();
      return;
    }
    this.currentStep++;
  }

  prevStep() {
    if (this.currentStep > 1) this.currentStep--;
  }

  goToStep(step: number) {
    this.currentStep = step;
  }

  getCurrentStepGroup(): FormGroup | null {
    // Optimización: acceso directo en lugar de switch si los nombres siguen patrón
    const groupName = `step${this.currentStep}`;
    return this.form.get(groupName) as FormGroup || null;
  }

  selectProvider(type: string) {
    const control = this.form.get('step1.providerType');
    control?.setValue(type);
    control?.markAsTouched();
  }

  submitForm() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = {
      providerType: this.form.value.step1.providerType,
      documents: this.form.value.step2,
      providerData: this.form.value.step3
    };

    console.log('Formulario listo para enviar:', payload);
    // TODO: Conectar API final
  }
}
