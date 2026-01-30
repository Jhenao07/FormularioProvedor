import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import  {  hasFlag  }  from  'country-flag-icons'
import { countries } from 'country-flag-icons'

@Component({
  selector: 'app-provider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css'
})
export class ProviderComponent {

  providerType: 'juridica' | 'natural' = 'juridica';
  currentStep = 1;
  form: FormGroup;

  constructor(private fb: FormBuilder) {



    this.form = this.fb.group({
      step1: this.fb.group({
        providerType: ['', Validators.required]
      }),


      step2: this.fb.group(
        {
          rut: [null],
          camara: [null],
          bancaria: [null]
        },
        {
          validators: ProviderComponent.atLeastOneFileValidator
        }
      ),


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



  static atLeastOneFileValidator(control: AbstractControl) {
    const value = control.value;
    if (!value) return { required: true };

    const hasFile = Object.values(value).some(
      v => v instanceof File
    );

    return hasFile ? null : { required: true };
  }

  onFileSelected(event: Event, docType: 'rut' | 'camara' | 'bancaria') {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const control = this.form.get(`step2.${docType}`);

    if (!control) return;

    control.setValue(file);
    control.markAsTouched();
    control.markAsDirty();

    // 🔥 fuerza revalidación del grupo
    this.form.get('step2')?.updateValueAndValidity();
  }

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
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  goToStep(step: number) {
    this.currentStep = step;
  }

  getCurrentStepGroup(): FormGroup | null {
    switch (this.currentStep) {
      case 1:
        return this.form.get('step1') as FormGroup;
      case 2:
        return this.form.get('step2') as FormGroup;
      case 3:
        return this.form.get('step3') as FormGroup;
      case 4:
        return this.form.get('step4') as FormGroup;
      default:
        return null;
    }
  }

  /* =====================================
     STEP 1: TIPO DE PROVEEDOR
  ===================================== */
  selectProvider(type: string) {
    this.form.get('step1.providerType')?.setValue(type);
    this.form.get('step1.providerType')?.markAsTouched();
  }

  get providerTypes(): string {
    return this.form.get('step1.providerType')?.value;
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

    // aquí luego conectarías API
  }

}
function ngOnInit() {
  throw new Error('Function not implemented.');
}

