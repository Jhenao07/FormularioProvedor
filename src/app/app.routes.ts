
import { Routes } from '@angular/router';

import {  InvitedComponent } from '../invited/invited.component';
import { FormComponent } from './form/form.component';
import { RegisterproviderComponent } from './registerprovider/registerprovider.component';
import { ProviderdatesComponent } from './registerprovider/providerdates/providerdates.component';
import { ProviderComponent } from './provider/provider.component';


export const routes: Routes = [
  {
    path: '',
    component: FormComponent
  },
    { path: '',
      redirectTo: 'invited',
      pathMatch: 'full' },
  {
    path: 'invited',
    component: InvitedComponent
  },
  {
    path: 'register-provider',
    component: RegisterproviderComponent
  },
  { path: 'provider',
    component: ProviderComponent},
  {
    path: '**',
    redirectTo: 'invited'
  }
];
