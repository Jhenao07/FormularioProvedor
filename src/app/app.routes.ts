import { Component } from '@angular/core';

import { Routes } from '@angular/router';

import {  InvitedComponent } from '../invited/invited.component';
import { FormComponent } from './form/form.component';
import { RegisterproviderComponent } from './registerprovider/registerprovider.component';
import { ProviderdatesComponent } from './registerprovider/providerdates/providerdates.component';


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
  { path: 'registerdates',
    component: ProviderdatesComponent},
  {
    path: '**',
    redirectTo: 'invited'
  }
];
