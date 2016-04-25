angular
  .module('holidays', [])
  .service('UtilService', function() {
    
    this.days_diff = function(now, date) {
      var date1 = new Date(date + 'T00:00:00-03:00'),
          date2 = new Date(now + 'T00:00:00-03:00'),
          timeDiff = Math.abs(date2.getTime() - date1.getTime()),
          diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24)); 

      return diffDays;
    }

    this.fulldate = function(date) {
      var date = new Date(date + 'T00:00:00-03:00'),
          monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 
            'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
          ],
          dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sabado'];

        return dayNames[date.getDay()] + ' ' + date.getDate() + ' de ' + monthNames[date.getMonth()];

    }

  })
  .controller('HolidaysController', ['$http', 'UtilService', function($http, UtilService) {
    var now = new Date([
          new Date().getFullYear(),
          ('0' + (new Date().getMonth() + 1)).slice(-2),
          ('0' + (new Date().getDate() + 1)).slice(-2)
        ].join('-') + 'T00:00:00-03:00'),
        vm = this;

    vm.days = 0;
    vm.title = "cargando...";
    vm.date = "cargando...";
    vm.extra = "cargando...";
    vm.holidays = [];
    vm.current_holiday = 0;

    $http
      .get('holidays.json')
      .then(
        function(res) {
          var ok = false;

          vm.holidays = res.data.data;

          res.data.data.forEach(function(holiday, index) {
            var date = new Date(holiday.date + 'T00:00:00-03:00');

            if (
                ok == false
                && date.getFullYear() >= now.getFullYear() 
                && date.getMonth() >= now.getMonth() 
                && date.getDate() >= now.getDate()) 
            {
              render(index);
              ok = true;
            }
          });
        },
        function() {
          vm.days = 0;
          vm.title = "Error";
          vm.date = "Recargue el sitio";
        });

      

      function render(index) {
        if (typeof vm.holidays[index] !== "undefined") {
          var holiday = vm.holidays[index];

          vm.days = UtilService.days_diff([
            now.getFullYear(), 
            ('0' + (now.getMonth() + 1)).slice(-2),
            ('0' + (now.getDate() + 1)).slice(-2)
          ].join('-'), holiday.date);
          vm.title = holiday.title;
          vm.extra = holiday.extra;
          vm.date = UtilService.fulldate(holiday.date);
          vm.current_holiday = index;
        }
      }

      vm.next_holiday = function() {
        render(vm.current_holiday + 1);
      }

      vm.previous_holiday = function() {
        render(vm.current_holiday - 1);
      }

  }]);