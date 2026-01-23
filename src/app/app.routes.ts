
import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import {  InvitedComponent } from '../invited/invited.component';
import { FormComponent } from './form/form.component';


export const routes: Routes = [
  {
    path: '',
    component: FormComponent
  },
  {
    path: 'invited',
    component: InvitedComponent
  },
  {
    path: '**',
    redirectTo: ''
  }
];
