import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-provider',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './provider.component.html',
  styleUrl: './provider.component.css'
})
export class ProviderComponent {
 currentStep = 1;
  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      step1: this.fb.group({
        providerType: ['', Validators.required]
      }),
      step2: this.fb.group({
        rut: [false],
        chamber: [false],
        bank: [false]
      },
       { validators: this.atLeastOneChecked }
    ),
      step3: this.fb.group({
        businessName: ['', Validators.required],
        nit: ['', Validators.required]
      })
    });

  }
  atLeastOneChecked(group: FormGroup) {
  const values = Object.values(group.value);
  return values.some(v => v === true) ? null : { required: true };
}


goToStep(step: number): void {
    this.currentStep = step;
  }

  nextStep(): void {
  const currentGroup = this.getCurrentStepGroup();

  if (!currentGroup) return;

  currentGroup.markAllAsTouched();

  if (currentGroup.invalid) {
    return;
  }

  if (this.currentStep < 4) {
    this.currentStep++;
  }
}

getCurrentStepGroup(): FormGroup | null {
  switch (this.currentStep) {
    case 1:
      return this.form.get('step1') as FormGroup;
    case 2:
      return this.form.get('step2') as FormGroup;
    case 3:
      return this.form.get('step3') as FormGroup;
    default:
      return null;
  }
}

  prevStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  // ===== Paso 1 =====
  selectProvider(type: string): void {
    this.form.get('step1.providerType')?.setValue(type);
  }

  get providerType(): string {
    return this.form.get('step1.providerType')?.value;
  }

  isStepCompleted(step: number): boolean {
  return step < this.currentStep;
  }

}

