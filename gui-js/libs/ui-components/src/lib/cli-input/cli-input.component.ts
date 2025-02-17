import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ElectronService } from '@minsky/core';
import { CppClass, unExposedTerminalCommands } from '@minsky/shared';
import { AutoUnsubscribe } from 'ngx-auto-unsubscribe';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import * as JSON5 from 'json5';

@AutoUnsubscribe()
@Component({
  selector: 'minsky-cli-input',
  templateUrl: './cli-input.component.html',
  styleUrls: ['./cli-input.component.scss'],
})
export class CliInputComponent implements OnInit, OnDestroy {
  commands: Array<string>;
  filteredOptions$: Observable<string[]>;
  command: string;
  args: string;
  form: FormGroup;
  output = [];

  public get commandControl(): AbstractControl {
    return this.form.get('command');
  }

  public get argsControl(): AbstractControl {
    return this.form.get('args');
  }

  constructor(private electronService: ElectronService) {}

  async ngOnInit() {
    this.form = new FormGroup({
      command: new FormControl('', Validators.required),
      args: new FormControl(),
    });

    this.filteredOptions$ = this.commandControl.valueChanges.pipe(
      startWith(''),
      map((value) => this._filter(value))
    );

    this.form.valueChanges.subscribe(() => {
      this.makeCommand();
    });

    if (this.electronService.isElectron) {
      let _commands = await this.electronService.minsky.$list();

      _commands = _commands.map((c) => `minsky${c}`);

      this.commands = [..._commands, ...unExposedTerminalCommands];
    }
  }

  async handleSubmit() {
    if (this.electronService.isElectron && this.command) {
      if (this.args)
        var output = await CppClass.backend(this.command,JSON5.parse(this.args));
      else
        var output = await CppClass.backend(this.command);
      this.output.push(`${this.command} ==> ${JSON5.stringify(output)}`);
    }
  }

  private makeCommand() {
    this.command =  this.commandControl.value;
    this.args = this.argsControl.value;
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();

    return this.commands?.filter((option) =>
      option.toLowerCase().includes(filterValue)
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,@angular-eslint/no-empty-lifecycle-method
  ngOnDestroy() {}
}
